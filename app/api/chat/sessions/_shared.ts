import { z } from "zod";

import {
  CHAT_SESSION_STATUSES,
  type MessageDto,
  type SessionDto,
} from "@/lib/api/chat-types";
import type { ChatMessage, ChatSession } from "@/lib/db/schema";

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
