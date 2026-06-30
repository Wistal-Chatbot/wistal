/**
 * Wire shapes for the chat session API. Kept free of `server-only`/`db` imports so
 * both the route handlers (serializers) and the client (`app/app/chat/chatApi.ts`
 * adapters) can share these types without pulling server code into the bundle.
 */

/** Allowed `chat_sessions.status` values — mirrors the DB check constraint. */
export const CHAT_SESSION_STATUSES = [
  "active",
  "completed",
  "failed",
  "archived",
] as const;

export type ChatSessionStatus = (typeof CHAT_SESSION_STATUSES)[number];

export interface SessionDto {
  id: string;
  title: string | null;
  status: string;
  webSearchEnabled: boolean;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface MessageDto {
  id: number;
  messageType: string;
  content: string;
  sqlGenerated: string | null;
  rowCount: number | null;
  createdAt: string;
}
