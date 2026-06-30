import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import {
  createChatMessage,
  getRecentMessages,
  insertQueryAudit,
  touchChatSession,
} from "@/lib/db/queries";
import type { AppUser, ChatMessage, ChatSession } from "@/lib/db/schema";
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
      queryAuditId: number | null;
    }
  | { type: "error"; error: string };

const MAX_ITERATIONS = 5;
const MAX_SQL_RETRIES = 2;
const ROW_LIMIT = 500;
const STATEMENT_TIMEOUT_MS = 10_000;

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

  const system = buildSystemPrompt();
  const tools = buildTools(session.webSearchEnabled);

  let finalText = "";
  const tablesUsedAll = new Set<string>();
  let lastRowCount: number | null = null;
  let totalExecutionMs = 0;
  let lastAuditId: number | null = null;
  let sqlRetries = 0;

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
      messages.push({ role: "assistant", content: message.content });

      // Server-tool loop (web search) paused — re-send to resume.
      if (message.stop_reason === "pause_turn") {
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
  } catch {
    yield { type: "error", error: "Serwis AI jest tymczasowo niedostępny." };
    return;
  }

  if (!finalText) {
    finalText = "Przepraszam, nie udało się przygotować odpowiedzi.";
  }

  const assistant = await createChatMessage({
    chatSessionId: session.id,
    userId: user.id,
    messageType: "assistant",
    content: finalText,
    rowCount: lastRowCount,
    metadata: {
      tables: [...tablesUsedAll],
      executionMs: totalExecutionMs || null,
      queryAuditId: lastAuditId,
    },
  });
  await touchChatSession(session.id);

  yield {
    type: "meta",
    messageId: assistant.id,
    tables: [...tablesUsedAll],
    rowCount: lastRowCount,
    executionMs: totalExecutionMs || null,
    queryAuditId: lastAuditId,
  };
}
