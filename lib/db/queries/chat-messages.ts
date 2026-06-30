import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import {
  chatMessages,
  chatSessions,
  type ChatMessage,
  type NewChatMessage,
} from "@/lib/db/schema";

/** Inserts a chat message and returns the created row. */
export async function createChatMessage(
  input: NewChatMessage,
): Promise<ChatMessage> {
  const [message] = await db.insert(chatMessages).values(input).returning();
  return message;
}

/**
 * The last `limit` messages of a session in chronological (ascending) order —
 * ready to map onto the Anthropic `messages` array (~6 turns of history).
 */
export async function getRecentMessages(
  sessionId: string,
  limit = 12,
): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatSessionId, sessionId))
    .orderBy(desc(chatMessages.id))
    .limit(limit);

  return rows.reverse();
}

/** Bumps `last_message_at`/`updated_at` after a turn completes. */
export async function touchChatSession(sessionId: string): Promise<void> {
  const now = new Date();
  await db
    .update(chatSessions)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(chatSessions.id, sessionId));
}

/** Sets the session title from the first question — only if it has none yet. */
export async function setSessionTitleIfEmpty(
  sessionId: string,
  title: string,
): Promise<void> {
  await db
    .update(chatSessions)
    .set({ title })
    .where(and(eq(chatSessions.id, sessionId), isNull(chatSessions.title)));
}
