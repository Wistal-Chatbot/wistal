import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  integer,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { chatMessages, chatSessions } from "./chat";
import { appUsers } from "./users-auth";
import { chatbot } from "./shared";

export const queryAudit = chatbot.table(
  "query_audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    chatSessionId: uuid("chat_session_id").references(() => chatSessions.id, {
      onDelete: "set null",
    }),
    messageId: bigint("message_id", { mode: "number" }).references(
      () => chatMessages.id,
      { onDelete: "set null" },
    ),
    userId: uuid("user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull().default("chatbot"),
    userInput: text("user_input"),
    sqlGenerated: text("sql_generated"),
    sqlExecuted: text("sql_executed"),
    sqlValid: boolean("sql_valid").notNull().default(false),
    validationError: text("validation_error"),
    tablesUsed: text("tables_used")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    rowCount: integer("row_count"),
    executionMs: integer("execution_ms"),
    llmModel: text("llm_model"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "query_audit_source_check",
      sql`${table.source} IN ('chatbot', 'manual_browser', 'quick_action', 'ai_report')`,
    ),
  ],
);

export const queryFeedback = chatbot.table("query_feedback", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  queryAuditId: bigint("query_audit_id", { mode: "number" }).references(
    () => queryAudit.id,
    { onDelete: "cascade" },
  ),
  messageId: bigint("message_id", { mode: "number" }).references(
    () => chatMessages.id,
    { onDelete: "cascade" },
  ),
  userId: uuid("user_id").references(() => appUsers.id, {
    onDelete: "set null",
  }),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type QueryAudit = typeof queryAudit.$inferSelect;
export type NewQueryAudit = typeof queryAudit.$inferInsert;
export type QueryFeedback = typeof queryFeedback.$inferSelect;
export type NewQueryFeedback = typeof queryFeedback.$inferInsert;
