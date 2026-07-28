import {
  index,
  integer,
  jsonb,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { chatbot } from "./shared";
import { appUsers } from "./users-auth";

export const appSettings = chatbot.table("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

/**
 * Versioned AI prompt texts, editable from the admin panel without a redeploy.
 *
 * **Append-only: the highest `version` for a `key` is the live one.** There is
 * deliberately no `is_active` flag — a flag can drift out of sync (two active
 * rows, or none), whereas "newest wins" cannot. Reverting is therefore not an
 * update but a new version carrying the older content, so the fact that a
 * revert happened stays in the history.
 *
 * `key` is one of `PROMPT_KEYS` (`lib/ai/prompt-defaults.ts`), which also holds
 * the compiled-in default used to seed this table and as the runtime fallback.
 */
export const systemPrompts = chatbot.table(
  "system_prompts",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    content: text("content").notNull(),
    version: integer("version").notNull(),
    /** Null for the migration seed and for users deleted since the edit. */
    createdBy: uuid("created_by").references(() => appUsers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("system_prompts_key_version_unique").on(table.key, table.version),
    index("system_prompts_key_version_idx").on(table.key, table.version),
  ],
);

export type SystemPrompt = typeof systemPrompts.$inferSelect;
export type NewSystemPrompt = typeof systemPrompts.$inferInsert;
