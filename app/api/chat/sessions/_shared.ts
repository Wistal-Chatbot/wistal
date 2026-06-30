import { z } from "zod";

import {
  CHAT_SESSION_STATUSES,
  type MessageDto,
  type MessageMetadata,
  type SessionDto,
} from "@/lib/api/chat-types";
import type { ChatMessage, ChatSession } from "@/lib/db/schema";

/** Normalizes the `chat_messages.metadata` JSONB blob to the wire shape. */
function readMessageMetadata(value: unknown): MessageMetadata {
  const meta = (value ?? {}) as Record<string, unknown>;
  return {
    tables: Array.isArray(meta.tables)
      ? meta.tables.filter((t): t is string => typeof t === "string")
      : [],
    executionMs: typeof meta.executionMs === "number" ? meta.executionMs : null,
    queryAuditId: typeof meta.queryAuditId === "number" ? meta.queryAuditId : null,
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
