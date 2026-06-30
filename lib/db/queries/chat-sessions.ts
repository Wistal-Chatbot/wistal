import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import {
  chatMessages,
  chatSessions,
  type ChatMessage,
  type ChatSession,
} from "@/lib/db/schema";

/**
 * Query helpers for chat sessions (and their messages). All session reads/writes
 * are scoped to a single owner via `userId`, so a handler can never touch another
 * user's session. Shared by the chat session route handlers and, later, by the
 * message pipeline (`POST /api/chat/sessions/:id/messages`).
 */

/** All sessions owned by a user, most recently active first. */
export async function listChatSessions(userId: string): Promise<ChatSession[]> {
  return db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(
      sql`coalesce(${chatSessions.lastMessageAt}, ${chatSessions.updatedAt}) desc`,
    );
}

/** Creates a new session for a user; unspecified columns fall back to schema defaults. */
export async function createChatSession(input: {
  userId: string;
  title?: string | null;
  webSearchEnabled?: boolean;
}): Promise<ChatSession> {
  const [session] = await db
    .insert(chatSessions)
    .values({
      userId: input.userId,
      title: input.title ?? null,
      ...(input.webSearchEnabled !== undefined
        ? { webSearchEnabled: input.webSearchEnabled }
        : {}),
    })
    .returning();

  return session;
}

/** A single session, but only if it belongs to `userId`; otherwise `null`. */
export async function getChatSessionForUser(
  sessionId: string,
  userId: string,
): Promise<ChatSession | null> {
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .limit(1);

  return session ?? null;
}

/** Messages of a session in chronological order. */
export async function getChatSessionMessages(
  sessionId: string,
): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatSessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
}

/**
 * Updates title and/or status of an owned session and bumps `updatedAt`. The
 * ownership filter is part of the UPDATE, so a non-owned id simply matches no
 * row and returns `null`.
 */
export async function updateChatSession(
  sessionId: string,
  userId: string,
  patch: { title?: string | null; status?: string },
): Promise<ChatSession | null> {
  const [session] = await db
    .update(chatSessions)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .returning();

  return session ?? null;
}

/** Sets the web-search flag of an owned session; non-owned id returns `null`. */
export async function setChatSessionWebSearch(
  sessionId: string,
  userId: string,
  enabled: boolean,
): Promise<ChatSession | null> {
  const [session] = await db
    .update(chatSessions)
    .set({ webSearchEnabled: enabled, updatedAt: new Date() })
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .returning();

  return session ?? null;
}
