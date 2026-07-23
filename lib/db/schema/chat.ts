import { sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { appUsers } from "./users-auth";
import { chatbot } from "./shared";

export const chatSessions = chatbot.table(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    status: text("status").notNull().default("active"),
    webSearchEnabled: boolean("web_search_enabled").notNull().default(false),
    input: jsonb("input").notNull().default(sql`'{}'::jsonb`),
    resultSummary: text("result_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "chat_sessions_status_check",
      sql`${table.status} IN ('active', 'completed', 'failed', 'archived')`,
    ),
  ],
);

export const chatMessages = chatbot.table(
  "chat_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    chatSessionId: uuid("chat_session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    messageType: text("message_type").notNull(),
    content: text("content").notNull(),
    sqlGenerated: text("sql_generated"),
    rowCount: integer("row_count"),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    retryable: boolean("retryable").notNull().default(false),
    isRetried: boolean("is_retried").notNull().default(false),
    retryOfMessageId: bigint("retry_of_message_id", { mode: "number" }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "chat_messages_message_type_check",
      sql`${table.messageType} IN ('user', 'assistant', 'tool', 'system')`,
    ),
    foreignKey({
      columns: [table.retryOfMessageId],
      foreignColumns: [table.id],
      name: "chat_messages_retry_of_message_id_chat_messages_id_fk",
    }).onDelete("set null"),
  ],
);

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
