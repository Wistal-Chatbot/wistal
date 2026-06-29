import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { appUsers } from "./users-auth";
import { chatbot } from "./shared";

export const quickActions = chatbot.table("quick_actions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  namePl: text("name_pl").notNull(),
  descriptionPl: text("description_pl"),
  category: text("category"),
  promptTemplate: text("prompt_template").notNull(),
  customInput: jsonb("custom_input").notNull().default(sql`'{}'::jsonb`),
  usesDatabase: boolean("uses_database").notNull().default(false),
  usesWebSearch: boolean("uses_web_search").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdBy: uuid("created_by").references(() => appUsers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const aiReports = chatbot.table("ai_reports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  outputSchema: jsonb("output_schema").notNull().default(sql`'{}'::jsonb`),
  htmlWidget: text("html_widget"),
  inputParams: jsonb("input_params").notNull().default(sql`'{}'::jsonb`),
  modelConfig: jsonb("model_config").notNull().default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => appUsers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const aiReportExecutions = chatbot.table(
  "ai_report_executions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reportId: uuid("report_id")
      .notNull()
      .references(() => aiReports.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    inputParams: jsonb("input_params").notNull().default(sql`'{}'::jsonb`),
    outputData: jsonb("output_data"),
    sqlQueries: text("sql_queries").array(),
    tokensUsed: integer("tokens_used"),
    executionMs: integer("execution_ms"),
    status: text("status").notNull().default("completed"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "ai_report_executions_status_check",
      sql`${table.status} IN ('completed', 'failed', 'timeout')`,
    ),
  ],
);

export type QuickAction = typeof quickActions.$inferSelect;
export type NewQuickAction = typeof quickActions.$inferInsert;
export type AiReport = typeof aiReports.$inferSelect;
export type NewAiReport = typeof aiReports.$inferInsert;
export type AiReportExecution = typeof aiReportExecutions.$inferSelect;
export type NewAiReportExecution = typeof aiReportExecutions.$inferInsert;
