import { z } from "zod";

import {
  CHAT_SESSION_STATUSES,
  type MessageDto,
  type MessageMetadata,
  type SessionDto,
  type TokenUsageMetadata,
} from "@/lib/api/chat-types";
import type { ChatMessage, ChatSession } from "@/lib/db/schema";

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTokenUsage(value: unknown): TokenUsageMetadata | null {
  const usage = (value ?? {}) as Record<string, unknown>;
  const inputTokens = readNumber(usage.inputTokens);
  const outputTokens = readNumber(usage.outputTokens);
  const cacheCreationInputTokens = readNumber(usage.cacheCreationInputTokens);
  const cacheReadInputTokens = readNumber(usage.cacheReadInputTokens);
  const totalTokens = readNumber(usage.totalTokens);

  if (
    inputTokens === null ||
    outputTokens === null ||
    cacheCreationInputTokens === null ||
    cacheReadInputTokens === null ||
    totalTokens === null
  ) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    totalTokens,
  };
}

/** Normalizes the `chat_messages.metadata` JSONB blob to the wire shape. */
function readMessageMetadata(value: unknown): MessageMetadata {
  const meta = (value ?? {}) as Record<string, unknown>;
  const tokenUsage = readTokenUsage(meta.tokenUsage);
  const tokensUsed = readNumber(meta.tokensUsed) ?? tokenUsage?.totalTokens ?? null;

  return {
    tables: Array.isArray(meta.tables)
      ? meta.tables.filter((t): t is string => typeof t === "string")
      : [],
    executionMs: readNumber(meta.executionMs),
    responseMs: readNumber(meta.responseMs),
    queryAuditId: readNumber(meta.queryAuditId),
    tokensUsed,
    tokenUsage,
  };
}

/** Maps a DB session row to its public wire shape (drops internal columns). */
export function serializeSession(row: ChatSession): SessionDto {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    webSearchEnabled: row.webSearchEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
  };
}

/** Maps a DB message row to its public wire shape. */
export function serializeMessage(row: ChatMessage): MessageDto {
  return {
    id: row.id,
    messageType: row.messageType,
    content: row.content,
    sqlGenerated: row.sqlGenerated,
    rowCount: row.rowCount,
    metadata: readMessageMetadata(row.metadata),
    createdAt: row.createdAt.toISOString(),
  };
}

export const sessionIdSchema = z.string().uuid();

export const createSessionSchema = z.object({
  title: z.string().trim().max(200).optional(),
  webSearchEnabled: z.boolean().optional(),
});

export const updateSessionSchema = z
  .object({
    title: z.string().trim().max(200).nullable().optional(),
    status: z.enum(CHAT_SESSION_STATUSES).optional(),
  })
  .refine((value) => value.title !== undefined || value.status !== undefined, {
    message: "Podaj tytuł lub status.",
  });

export const webSearchSchema = z.object({ enabled: z.boolean() });
