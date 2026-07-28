import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import {
  createChatMessage,
  getRecentMessages,
  insertQueryAudit,
} from "@/lib/db/queries";
import type { TokenUsageMetadata } from "@/lib/api/chat-types";
import { getCompanyData, searchCompanies } from "@/lib/bizraport/client";
import { searchPlaceRatings } from "@/lib/google-places/client";
import type { AppUser, ChatMessage, ChatSession } from "@/lib/db/schema";
import { log, preview } from "@/lib/log";
import { enforceRowLimit } from "@/lib/sql/enforce-row-limit";
import { executeReadOnly } from "@/lib/sql/execute";
import { getPublicTableAllowlist } from "@/lib/sql/allowlist";
import { validateSql } from "@/lib/sql/validate";

import { CHAT_MODEL, MAX_OUTPUT_TOKENS, getAnthropic } from "./anthropic";
import { buildSystemPrompt } from "./system-prompt";
import { addTokenUsage, createTokenUsageTotals } from "./token-usage-core";
import { buildTools } from "./tools";
import {
  finalAnswerFromModelTurn,
  workingStatusForTools,
} from "./turn-presentation";
import {
  persistChatError,
  touchChatSessionBestEffort,
  type ChatErrorEvent,
  type RetryContext,
} from "./chat-errors";
import {
  ChatResponsePersistenceError,
  classifyChatError,
} from "./chat-error-classification";
import {
  buildFinalizationMessages,
  ChatResponseIncompleteError,
  MAX_EXPLORATION_ROUNDS,
  shouldStopExploration,
  sqlExecutionFeedback,
} from "./orchestrator-policy";

export type ChatTurnEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | {
      type: "meta";
      messageId: number;
      userMessageId: number;
      tables: string[];
      rowCount: number | null;
      executionMs: number | null;
      responseMs: number | null;
      queryAuditId: number | null;
      tokensUsed: number | null;
      tokenUsage: TokenUsageMetadata | null;
    }
  | ChatErrorEvent;

const ROW_LIMIT = 500;
/**
 * Rows actually serialized into the `tool_result` handed back to the model. The
 * query still executes with `LIMIT 500` (ROW_LIMIT) so `row_count` and truncation
 * detection stay accurate, but only the first MODEL_ROW_LIMIT rows are paid for as
 * (uncached) model input on the summarize call — the biggest per-message cost.
 */
const MODEL_ROW_LIMIT = 150;
/** Prior messages replayed as context each turn (kept small — resent uncached). */
const HISTORY_MESSAGE_LIMIT = 6;
const STATEMENT_TIMEOUT_MS = 10_000;

function toAnthropicMessage(message: ChatMessage): Anthropic.MessageParam {
  return {
    role: message.messageType === "assistant" ? "assistant" : "user",
    content: message.content,
  };
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
  /** Audit trail source; `quick_action` when driven by a Szybka akcja. */
  source?: "chatbot" | "quick_action";
  retryContext: RetryContext;
  retryOfMessageId?: number | null;
}): AsyncGenerator<ChatTurnEvent> {
  const turnStartedAt = Date.now();
  const {
    session,
    user,
    source = "chatbot",
    retryContext,
    retryOfMessageId = null,
  } = params;
  const anthropic = getAnthropic();
  yield { type: "status", text: "Analizuję pytanie…" };
  const allowlist = await getPublicTableAllowlist();

  const history = await getRecentMessages(
    session.id,
    HISTORY_MESSAGE_LIMIT,
    retryContext.userMessageId,
  );
  const messages: Anthropic.MessageParam[] = history
    .filter(
      (m) =>
        (m.messageType === "user" || m.messageType === "assistant") &&
        !m.errorCode,
    )
    .map(toAnthropicMessage);
  // The Anthropic API requires the first message to be a user turn; the history
  // window can begin on an assistant message in long conversations.
  while (messages.length > 0 && messages[0].role === "assistant") {
    messages.shift();
  }

  const userInput =
    [...history].reverse().find((m) => m.messageType === "user")?.content ?? "";

  const system = await buildSystemPrompt(session.webSearchEnabled);
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
  let sqlFailures = 0;
  let sqlSuccesses = 0;
  let explorationRounds = 0;
  let toolCallCount = 0;
  let forcedFinalization = false;
  let finalAnswerStreamed = false;
  let terminationReason = "unknown";
  const tokenUsage = createTokenUsageTotals();

  try {
    exploration: for (
      let i = 0;
      i < MAX_EXPLORATION_ROUNDS;
      i += 1
    ) {
      explorationRounds += 1;
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
        }
      }

      const message = await stream.finalMessage();
      addTokenUsage(tokenUsage, message.usage);

      log.info("chat.orchestrator", "model turn", {
        sessionId: session.id,
        iteration: i,
        stopReason: message.stop_reason,
        tokensUsed: tokenUsage.totalTokens,
      });

      // Server-tool loop (web search) paused — re-send to resume.
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        log.info("chat.orchestrator", "web search running (pause_turn)", {
          sessionId: session.id,
          iteration: i,
        });
        yield { type: "status", text: "Wyszukuję informacje w internecie…" };
        continue;
      }

      const completedAnswer = finalAnswerFromModelTurn(
        message.stop_reason,
        turnText,
      );
      if (completedAnswer !== null) {
        terminationReason = completedAnswer
          ? "model_ready_for_synthesis"
          : "empty_model_answer";
        break;
      }

      messages.push({ role: "assistant", content: message.content });
      const toolUses = message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      toolCallCount += toolUses.length;

      const clarification = toolUses.find((t) => t.name === "ask_clarification");
      if (clarification) {
        const question = (clarification.input as { question?: string }).question;
        finalText =
          question?.trim() || "Czy możesz doprecyzować swoje pytanie?";
        terminationReason = "clarification";
        log.info("chat.orchestrator", "ask_clarification", {
          sessionId: session.id,
        });
        break;
      }

      const toolStatus = workingStatusForTools(
        toolUses.map((toolUse) => toolUse.name),
      );
      if (toolStatus) {
        yield { type: "status", text: toolStatus };
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        if (toolUse.name === "get_company_info") {
          const input = toolUse.input as { nip?: string; krs?: string };
          const startedAt = Date.now();
          try {
            const data = await getCompanyData({ nip: input.nip, krs: input.krs });
            log.info("chat.orchestrator", "bizraport company info", {
              sessionId: session.id,
              lookup: input.krs ? "krs" : "nip",
              ms: Date.now() - startedAt,
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(data),
            });
          } catch (error) {
            log.warn("chat.orchestrator", "bizraport company info failed", {
              sessionId: session.id,
              error: error instanceof Error ? error.message : String(error),
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content:
                error instanceof Error
                  ? error.message
                  : "Błąd pobierania danych z BizRaport.",
              is_error: true,
            });
          }
          continue;
        }

        if (toolUse.name === "search_company") {
          const input = toolUse.input as { query?: string; limit?: number };
          try {
            const result = await searchCompanies(
              String(input.query ?? ""),
              input.limit,
            );
            log.info("chat.orchestrator", "bizraport search", {
              sessionId: session.id,
              resultCount: result.krs.length,
              truncated: result.truncated,
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            log.warn("chat.orchestrator", "bizraport search failed", {
              sessionId: session.id,
              error: error instanceof Error ? error.message : String(error),
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content:
                error instanceof Error
                  ? error.message
                  : "Błąd wyszukiwania w BizRaport.",
              is_error: true,
            });
          }
          continue;
        }

        if (toolUse.name === "get_google_rating") {
          const input = toolUse.input as { query?: string; miasto?: string };
          try {
            const places = await searchPlaceRatings(String(input.query ?? ""), {
              city: input.miasto,
            });
            log.info("chat.orchestrator", "google rating", {
              sessionId: session.id,
              resultCount: places.length,
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify({ places }),
            });
          } catch (error) {
            log.warn("chat.orchestrator", "google rating failed", {
              sessionId: session.id,
              error: error instanceof Error ? error.message : String(error),
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content:
                error instanceof Error
                  ? error.message
                  : "Błąd pobierania oceny Google.",
              is_error: true,
            });
          }
          continue;
        }

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
        if (shouldStopExploration(sqlFailures)) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content:
              "Limit błędów SQL został osiągnięty. Przygotuj odpowiedź na podstawie poprawnych wyników, które już otrzymałeś.",
            is_error: true,
          });
          continue;
        }
        const validation = validateSql(sql, allowlist);

        if (!validation.ok) {
          sqlFailures += 1;
          log.warn("chat.orchestrator", "sql rejected by validator", {
            sessionId: session.id,
            error: validation.error,
            sql: preview(sql),
          });
          await insertQueryAudit({
            chatSessionId: session.id,
            userId: user.id,
            source,
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
          sqlSuccesses += 1;
          log.info("chat.orchestrator", "sql executed", {
            sessionId: session.id,
            tables: validation.tablesUsed,
            rowCount: rows.length,
            executionMs,
          });
          lastAuditId = await insertQueryAudit({
            chatSessionId: session.id,
            userId: user.id,
            source,
            userInput,
            sqlGenerated: sql,
            sqlExecuted: executable,
            sqlValid: true,
            tablesUsed: validation.tablesUsed,
            rowCount: rows.length,
            executionMs,
            llmModel: CHAT_MODEL,
          });
          const rowsForModel = rows.slice(0, MODEL_ROW_LIMIT);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({
              row_count: rows.length,
              rows_shown: rowsForModel.length,
              rows: rowsForModel,
            }),
          });
        } catch (error) {
          sqlFailures += 1;
          log.error("chat.orchestrator", "sql execution failed", {
            sessionId: session.id,
            error: error instanceof Error ? error.message : String(error),
            sql: preview(executable),
          });
          await insertQueryAudit({
            chatSessionId: session.id,
            userId: user.id,
            source,
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
            content: sqlExecutionFeedback(error),
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
      yield { type: "status", text: "Przygotowuję odpowiedź…" };
      if (shouldStopExploration(sqlFailures)) {
        terminationReason = "sql_failure_budget";
        break exploration;
      }
    }

    if (!finalText) {
      if (terminationReason === "unknown") {
        terminationReason = "exploration_budget";
        forcedFinalization = true;
      } else if (
        terminationReason === "sql_failure_budget" ||
        terminationReason === "empty_model_answer"
      ) {
        forcedFinalization = true;
      }
      log.info("chat.orchestrator", "starting final answer synthesis", {
        sessionId: session.id,
        explorationRounds,
        toolCallCount,
        sqlSuccesses,
        sqlFailures,
        terminationReason,
      });

      yield { type: "status", text: "Przygotowuję odpowiedź…" };
      const finalStream = anthropic.messages.stream({
        model: CHAT_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        messages: buildFinalizationMessages(messages),
        tools,
        tool_choice: { type: "none" },
      });
      let finalizationText = "";
      for await (const event of finalStream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          finalizationText += event.delta.text;
          finalAnswerStreamed = true;
          yield { type: "delta", text: event.delta.text };
        }
      }
      const finalMessage = await finalStream.finalMessage();
      addTokenUsage(tokenUsage, finalMessage.usage);
      finalText = finalizationText.trim();
      if (!finalText) {
        throw new ChatResponseIncompleteError();
      }
      terminationReason = forcedFinalization
        ? "forced_finalization"
        : "final_synthesis";
    }
  } catch (error) {
    const classified = classifyChatError(error);
    log.error("chat.orchestrator", "turn failed", {
      sessionId: session.id,
      errorCode: classified.code,
      error: classified.detail,
      stack: error instanceof Error ? error.stack : undefined,
      explorationRounds,
      toolCallCount,
      sqlSuccesses,
      sqlFailures,
      forcedFinalization,
      terminationReason,
    });
    yield await persistChatError({
      error,
      sessionId: session.id,
      userId: user.id,
      retryContext,
      retryOfMessageId,
    });
    return;
  }

  const responseMs = Date.now() - turnStartedAt;

  if (!finalAnswerStreamed) {
    yield { type: "delta", text: finalText };
  }

  yield { type: "status", text: "Zapisuję odpowiedź…" };

  let assistant: Awaited<ReturnType<typeof createChatMessage>>;
  try {
    assistant = await createChatMessage({
      chatSessionId: session.id,
      userId: user.id,
      messageType: "assistant",
      content: finalText,
      retryOfMessageId,
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
  } catch (error) {
    const persistenceError = new ChatResponsePersistenceError(error);
    const classified = classifyChatError(persistenceError);
    log.error("chat.orchestrator", "assistant persistence failed", {
      sessionId: session.id,
      userId: user.id,
      errorCode: classified.code,
      error: classified.detail,
    });
    yield await persistChatError({
      error: persistenceError,
      sessionId: session.id,
      userId: user.id,
      retryContext,
      retryOfMessageId,
    });
    return;
  }
  await touchChatSessionBestEffort(session.id, "chat.orchestrator");

  log.info("chat.orchestrator", "turn done", {
    sessionId: session.id,
    messageId: assistant.id,
    tables: [...tablesUsedAll],
    rowCount: lastRowCount,
    executionMs: totalExecutionMs || null,
    responseMs,
    tokensUsed: tokenUsage.totalTokens || null,
    finalTextLength: finalText.length,
    explorationRounds,
    toolCallCount,
    sqlSuccesses,
    sqlFailures,
    forcedFinalization,
    terminationReason,
  });

  yield {
    type: "meta",
    messageId: assistant.id,
    userMessageId: retryContext.userMessageId,
    tables: [...tablesUsedAll],
    rowCount: lastRowCount,
    executionMs: totalExecutionMs || null,
    responseMs,
    queryAuditId: lastAuditId,
    tokensUsed: tokenUsage.totalTokens || null,
    tokenUsage: tokenUsage.totalTokens > 0 ? tokenUsage : null,
  };
}
