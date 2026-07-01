import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import type { TokenUsageMetadata } from "@/lib/api/chat-types";
import {
  createChatMessage,
  insertQueryAudit,
  touchChatSession,
} from "@/lib/db/queries";
import type { AppUser, ChatSession } from "@/lib/db/schema";
import { log } from "@/lib/log";

import { CHAT_MODEL, MAX_OUTPUT_TOKENS, getAnthropic } from "./anthropic";
import type { ChatTurnEvent } from "./orchestrator";
import { buildDataAnswerSystemPrompt } from "./system-prompt";

function renderRow(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(
      ([key, value]) =>
        `${key}: ${value === null || value === undefined ? "—" : String(value)}`,
    )
    .join("\n");
}

function usageToMetadata(usage: Anthropic.Usage): TokenUsageMetadata {
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: cacheCreation,
    cacheReadInputTokens: cacheRead,
    totalTokens:
      usage.input_tokens + usage.output_tokens + cacheCreation + cacheRead,
  };
}

/**
 * Runs a `row_from_table` quick action. The chosen row was already fetched with a
 * deterministic, admin-defined SQL, so the model gets the data directly (no tools,
 * no SQL) and only composes the Polish answer. Persists the assistant message and
 * an audit row. Never logs the row data / PII to the audit — only the admin prompt
 * and the executed SQL template.
 */
export async function* streamDataAnswer(params: {
  session: ChatSession;
  user: AppUser;
  promptTemplate: string;
  data: Record<string, unknown>;
  table: string;
  sqlExecuted: string;
  source?: "chatbot" | "quick_action";
}): AsyncGenerator<ChatTurnEvent> {
  const {
    session,
    user,
    promptTemplate,
    data,
    table,
    sqlExecuted,
    source = "quick_action",
  } = params;
  const startedAt = Date.now();
  const anthropic = getAnthropic();

  const userContent = `${promptTemplate}\n\nDane z bazy (wybrany rekord):\n${renderRow(data)}`;

  let finalText = "";
  let tokenUsage: TokenUsageMetadata | null = null;
  try {
    const stream = anthropic.messages.stream({
      model: CHAT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildDataAnswerSystemPrompt(),
      messages: [{ role: "user", content: userContent }],
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        finalText += event.delta.text;
        yield { type: "delta", text: event.delta.text };
      }
    }
    const message = await stream.finalMessage();
    tokenUsage = usageToMetadata(message.usage);
  } catch (error) {
    log.error("quick-actions.data-answer", "turn failed", {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    });
    yield { type: "error", error: "Serwis AI jest tymczasowo niedostępny." };
    return;
  }

  if (!finalText.trim()) {
    finalText = "Przepraszam, nie udało się przygotować odpowiedzi.";
  }

  const responseMs = Date.now() - startedAt;

  const auditId = await insertQueryAudit({
    chatSessionId: session.id,
    userId: user.id,
    source,
    userInput: promptTemplate,
    sqlExecuted,
    sqlValid: true,
    tablesUsed: [table],
    rowCount: 1,
    llmModel: CHAT_MODEL,
  });

  const assistant = await createChatMessage({
    chatSessionId: session.id,
    userId: user.id,
    messageType: "assistant",
    content: finalText,
    rowCount: 1,
    metadata: {
      tables: [table],
      executionMs: null,
      responseMs,
      queryAuditId: auditId,
      tokensUsed: tokenUsage?.totalTokens ?? null,
      tokenUsage: tokenUsage && tokenUsage.totalTokens > 0 ? tokenUsage : null,
    },
  });
  await touchChatSession(session.id);

  yield {
    type: "meta",
    messageId: assistant.id,
    tables: [table],
    rowCount: 1,
    executionMs: null,
    responseMs,
    queryAuditId: auditId,
    tokensUsed: tokenUsage?.totalTokens ?? null,
    tokenUsage: tokenUsage && tokenUsage.totalTokens > 0 ? tokenUsage : null,
  };
}
