import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import {
  createChatMessage,
  getRecentMessages,
  insertQueryAudit,
  touchChatSession,
} from "@/lib/db/queries";
import type { TokenUsageMetadata } from "@/lib/api/chat-types";
import type { AppUser, ChatMessage, ChatSession } from "@/lib/db/schema";
import { log, preview } from "@/lib/log";
import { enforceRowLimit } from "@/lib/sql/enforce-row-limit";
import { executeReadOnly } from "@/lib/sql/execute";
import { getPublicTableAllowlist } from "@/lib/sql/allowlist";
import { validateSql } from "@/lib/sql/validate";

import { CHAT_MODEL, MAX_OUTPUT_TOKENS, getAnthropic } from "./anthropic";
import { buildSystemPrompt } from "./system-prompt";
import { buildTools } from "./tools";

export type ChatTurnEvent =
  | { type: "delta"; text: string }
  | {
      type: "meta";
      messageId: number;
      tables: string[];
      rowCount: number | null;
      executionMs: number | null;
      responseMs: number | null;
      queryAuditId: number | null;
      tokensUsed: number | null;
      tokenUsage: TokenUsageMetadata | null;
    }
  | { type: "error"; error: string };

const MAX_ITERATIONS = 5;
const MAX_SQL_RETRIES = 2;
const ROW_LIMIT = 500;
const STATEMENT_TIMEOUT_MS = 10_000;

function createTokenUsageTotals(): TokenUsageMetadata {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalTokens: 0,
  };
}

function addTokenUsage(
  totals: TokenUsageMetadata,
  usage: Anthropic.Usage,
): void {
  totals.inputTokens += usage.input_tokens;
  totals.outputTokens += usage.output_tokens;
  totals.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
  totals.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
  totals.totalTokens =
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheCreationInputTokens +
    totals.cacheReadInputTokens;
}

function toAnthropicMessage(message: ChatMessage): Anthropic.MessageParam {
  return {
    role: message.messageType === "assistant" ? "assistant" : "user",
    content: message.content,
  };
}

function postgresErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "57014") {
    return "Zapytanie trwało zbyt długo. Zawęź zakres dat lub dodaj filtry.";
  }
  return "Wystąpił błąd podczas wykonywania zapytania. Spróbuj zawęzić zakres danych.";
}

/**
 * Runs one chat turn: builds the prompt from history, drives the agentic
 * tool-use loop (execute_sql / ask_clarification), validates + executes SQL
 * read-only, audits each query, persists the assistant message, and yields the
 * answer as a stream of events. The latest user message must already be saved.
 */
export async function* runChatTurn(params: {
  session: ChatSession;
  user: AppUser;
}): AsyncGenerator<ChatTurnEvent> {
  const turnStartedAt = Date.now();
  const { session, user } = params;
  const anthropic = getAnthropic();
  const allowlist = await getPublicTableAllowlist();

  const history = await getRecentMessages(session.id);
  const messages: Anthropic.MessageParam[] = history
    .filter((m) => m.messageType === "user" || m.messageType === "assistant")
    .map(toAnthropicMessage);
  // The Anthropic API requires the first message to be a user turn; the history
  // window can begin on an assistant message in long conversations.
  while (messages.length > 0 && messages[0].role === "assistant") {
    messages.shift();
  }

  const userInput =
    [...history].reverse().find((m) => m.messageType === "user")?.content ?? "";

  const system = buildSystemPrompt(session.webSearchEnabled);
  const tools = buildTools(session.webSearchEnabled);

  log.info("chat.orchestrator", "turn start", {
    sessionId: session.id,
    userId: user.id,
    model: CHAT_MODEL,
    webSearchEnabled: session.webSearchEnabled,
    toolCount: tools.length,
    hasWebSearchTool: tools.some(
      (t) => "type" in t && t.type === "web_search_20260209",
    ),
    historyMessages: messages.length,
    userInput: preview(userInput),
  });

  let finalText = "";
  const tablesUsedAll = new Set<string>();
  let lastRowCount: number | null = null;
  let totalExecutionMs = 0;
  let lastAuditId: number | null = null;
  let sqlRetries = 0;
  const tokenUsage = createTokenUsageTotals();

  try {
    loop: for (let i = 0; i < MAX_ITERATIONS; i++) {
      const stream = anthropic.messages.stream({
        model: CHAT_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages,
        tools,
        tool_choice: { type: "auto" },
      });

      let turnText = "";
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          turnText += event.delta.text;
          yield { type: "delta", text: event.delta.text };
        }
      }

      const message = await stream.finalMessage();
      addTokenUsage(tokenUsage, message.usage);
      messages.push({ role: "assistant", content: message.content });

      log.info("chat.orchestrator", "model turn", {
        sessionId: session.id,
        iteration: i,
        stopReason: message.stop_reason,
        tokensUsed: tokenUsage.totalTokens,
      });

      // Server-tool loop (web search) paused — re-send to resume.
      if (message.stop_reason === "pause_turn") {
        log.info("chat.orchestrator", "web search running (pause_turn)", {
          sessionId: session.id,
          iteration: i,
        });
        continue;
      }

      if (message.stop_reason !== "tool_use") {
        finalText = turnText.trim();
        break;
      }

      const toolUses = message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );

      const clarification = toolUses.find((t) => t.name === "ask_clarification");
      if (clarification) {
        const question = (clarification.input as { question?: string }).question;
        finalText =
          question?.trim() || "Czy możesz doprecyzować swoje pytanie?";
        log.info("chat.orchestrator", "ask_clarification", {
          sessionId: session.id,
        });
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        if (toolUse.name !== "execute_sql") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: "Nieznane narzędzie.",
            is_error: true,
          });
          continue;
        }

        const sql = String((toolUse.input as { sql?: string }).sql ?? "");
        const validation = validateSql(sql, allowlist);

        if (!validation.ok) {
          sqlRetries += 1;
          log.warn("chat.orchestrator", "sql rejected by validator", {
            sessionId: session.id,
            error: validation.error,
            sql: preview(sql),
          });
          await insertQueryAudit({
            chatSessionId: session.id,
            userId: user.id,
            source: "chatbot",
            userInput,
            sqlGenerated: sql,
            sqlValid: false,
            validationError: validation.error,
            llmModel: CHAT_MODEL,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Błąd walidacji SQL: ${validation.error}`,
            is_error: true,
          });
          continue;
        }

        const executable = enforceRowLimit(sql, ROW_LIMIT);
        try {
          const { rows, executionMs } = await executeReadOnly(executable, {
            timeoutMs: STATEMENT_TIMEOUT_MS,
          });
          validation.tablesUsed.forEach((t) => tablesUsedAll.add(t));
          lastRowCount = rows.length;
          totalExecutionMs += executionMs;
          log.info("chat.orchestrator", "sql executed", {
            sessionId: session.id,
            tables: validation.tablesUsed,
            rowCount: rows.length,
            executionMs,
          });
          lastAuditId = await insertQueryAudit({
            chatSessionId: session.id,
            userId: user.id,
            source: "chatbot",
            userInput,
            sqlGenerated: sql,
            sqlExecuted: executable,
            sqlValid: true,
            tablesUsed: validation.tablesUsed,
            rowCount: rows.length,
            executionMs,
            llmModel: CHAT_MODEL,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ row_count: rows.length, rows }),
          });
        } catch (error) {
          log.error("chat.orchestrator", "sql execution failed", {
            sessionId: session.id,
            error: error instanceof Error ? error.message : String(error),
            sql: preview(executable),
          });
          await insertQueryAudit({
            chatSessionId: session.id,
            userId: user.id,
            source: "chatbot",
            userInput,
            sqlGenerated: sql,
            sqlExecuted: executable,
            sqlValid: true,
            tablesUsed: validation.tablesUsed,
            errorMessage: String(error),
            llmModel: CHAT_MODEL,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: postgresErrorMessage(error),
            is_error: true,
          });
        }
      }

      if (sqlRetries > MAX_SQL_RETRIES) {
        finalText =
          "Nie udało się przygotować poprawnego zapytania. Spróbuj sformułować pytanie inaczej.";
        break loop;
      }

      messages.push({ role: "user", content: toolResults });
    }
  } catch (error) {
    log.error("chat.orchestrator", "turn failed", {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    yield { type: "error", error: "Serwis AI jest tymczasowo niedostępny." };
    return;
  }

  if (!finalText) {
    finalText = "Przepraszam, nie udało się przygotować odpowiedzi.";
  }

  const responseMs = Date.now() - turnStartedAt;

  const assistant = await createChatMessage({
    chatSessionId: session.id,
    userId: user.id,
    messageType: "assistant",
    content: finalText,
    rowCount: lastRowCount,
    metadata: {
      tables: [...tablesUsedAll],
      executionMs: totalExecutionMs || null,
      responseMs,
      queryAuditId: lastAuditId,
      tokensUsed: tokenUsage.totalTokens || null,
      tokenUsage: tokenUsage.totalTokens > 0 ? tokenUsage : null,
    },
  });
  await touchChatSession(session.id);

  log.info("chat.orchestrator", "turn done", {
    sessionId: session.id,
    messageId: assistant.id,
    tables: [...tablesUsedAll],
    rowCount: lastRowCount,
    executionMs: totalExecutionMs || null,
    responseMs,
    tokensUsed: tokenUsage.totalTokens || null,
    finalTextLength: finalText.length,
  });

  yield {
    type: "meta",
    messageId: assistant.id,
    tables: [...tablesUsedAll],
    rowCount: lastRowCount,
    executionMs: totalExecutionMs || null,
    responseMs,
    queryAuditId: lastAuditId,
    tokensUsed: tokenUsage.totalTokens || null,
    tokenUsage: tokenUsage.totalTokens > 0 ? tokenUsage : null,
  };
}
