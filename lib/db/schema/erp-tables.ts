import {
  boolean,
  index,
  integer,
  jsonb,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { chatbot } from "./shared";

/**
 * The editable ERP tables model — one DB-backed source of truth that both the AI
 * schema prompt (`{{ERP_SCHEMA}}`) and the manual Dane browser derive from
 * (`lib/erp-schema/*`). Seeded from `DEFAULT_ERP_MODEL` (`lib/erp-schema/model.ts`),
 * which is also the runtime fallback if Neon is unreachable.
 *
 * Deliberately **not versioned** (unlike `system_prompts`): edits are in-place
 * full replacements — there is no per-edit history here. Read-only SQL safety
 * does not depend on this table (the executable allowlist is derived live from
 * `public` base tables in `lib/sql/allowlist.ts`); at most an edit changes the
 * schema *description* the model sees and which columns the browser advertises.
 */
export const erpTables = chatbot.table("erp_tables", {
  /** Real `public` table name, e.g. `kontrahenci`. */
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  /** Business synonyms for the AI (browser ignores these). */
  synonyms: jsonb("synonyms").$type<string[]>().notNull().default([]),
  /** Join hints for the AI, e.g. `kontrahent_kod -> kontrahenci.kod`. */
  joins: jsonb("joins").$type<string[]>().notNull().default([]),
  /** Free-form markdown appended after the columns in the schema text. */
  notes: text("notes"),
  /** Display / render order. */
  position: integer("position").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ErpTableRow = typeof erpTables.$inferSelect;
export type NewErpTableRow = typeof erpTables.$inferInsert;

export const erpColumns = chatbot.table(
  "erp_columns",
  {
    id: serial("id").primaryKey(),
    tableKey: text("table_key")
      .notNull()
      .references(() => erpTables.key, { onDelete: "cascade" }),
    /** Real `public` column name. */
    name: text("name").notNull(),
    label: text("label").notNull(),
    /** One of `ColumnType` (`text|integer|numeric|date`). */
    type: text("type").notNull(),
    /** Part of the primary key. */
    pk: boolean("pk").notNull().default(false),
    searchable: boolean("searchable").notNull().default(false),
    filterable: boolean("filterable").notNull().default(false),
    sortable: boolean("sortable").notNull().default(false),
    /** Order within the table. */
    position: integer("position").notNull().default(0),
  },
  (table) => [
    unique("erp_columns_table_key_name_unique").on(table.tableKey, table.name),
    index("erp_columns_table_key_idx").on(table.tableKey),
  ],
);

export type ErpColumnRow = typeof erpColumns.$inferSelect;
export type NewErpColumnRow = typeof erpColumns.$inferInsert;
