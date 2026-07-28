import "server-only";

import { and, asc, desc, eq, gt, isNull, lte } from "drizzle-orm";

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

export async function getChatMessageForSession(
  messageId: number,
  sessionId: string,
): Promise<ChatMessage | null> {
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.id, messageId),
        eq(chatMessages.chatSessionId, sessionId),
      ),
    )
    .limit(1);
  return message ?? null;
}

/** Atomically reserves one retry attempt. */
export async function claimChatMessageRetry(
  messageId: number,
  sessionId: string,
): Promise<ChatMessage | null> {
  const [message] = await db
    .update(chatMessages)
    .set({ isRetried: true })
    .where(
      and(
        eq(chatMessages.id, messageId),
        eq(chatMessages.chatSessionId, sessionId),
        eq(chatMessages.retryable, true),
        eq(chatMessages.isRetried, false),
      ),
    )
    .returning();
  return message ?? null;
}

/**
 * Resolves the latest visible user turn and retires its current assistant answer,
 * if one exists. The update guard makes concurrent redo requests safe: only one
 * request can claim the answer that is currently visible.
 */
export async function claimChatTurnRedo(
  sessionId: string,
  userMessageId: number,
): Promise<
  | { userMessage: ChatMessage; assistantMessage: ChatMessage | null }
  | null
> {
  return db.transaction(async (tx) => {
    const [userMessage] = await tx
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.chatSessionId, sessionId),
          eq(chatMessages.id, userMessageId),
          eq(chatMessages.messageType, "user"),
        ),
      )
      .limit(1);
    if (!userMessage) return null;

    const [nextVisible] = await tx
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.chatSessionId, sessionId),
          gt(chatMessages.id, userMessage.id),
          eq(chatMessages.isRetried, false),
        ),
      )
      .orderBy(asc(chatMessages.id))
      .limit(1);

    if (!nextVisible || nextVisible.messageType === "user") {
      return { userMessage, assistantMessage: null };
    }
    if (nextVisible.messageType !== "assistant") return null;

    const [assistantMessage] = await tx
      .update(chatMessages)
      .set({ isRetried: true })
      .where(
        and(
          eq(chatMessages.id, nextVisible.id),
          eq(chatMessages.chatSessionId, sessionId),
          eq(chatMessages.messageType, "assistant"),
          eq(chatMessages.isRetried, false),
        ),
      )
      .returning();

    if (!assistantMessage) return null;
    return { userMessage, assistantMessage };
  });
}

/**
 * The last `limit` messages of a session in chronological (ascending) order —
 * ready to map onto the Anthropic `messages` array (~6 turns of history).
 */
export async function getRecentMessages(
  sessionId: string,
  limit = 12,
  throughMessageId?: number,
): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.chatSessionId, sessionId),
        ...(throughMessageId === undefined
          ? []
          : [lte(chatMessages.id, throughMessageId)]),
      ),
    )
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
