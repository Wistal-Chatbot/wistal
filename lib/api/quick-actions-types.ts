/**
 * Wire shapes and the `quick_actions.custom_input` contract. Kept free of
 * `server-only`/`db` imports (like `chat-types.ts`) so both the route handlers
 * and the client can share these types. The server-only pieces that touch SQL
 * (searching/fetching rows, validating input) live in `lib/quick-actions/*`.
 */

import { z } from "zod";

/**
 * `quick_actions.custom_input` is a JSONB blob describing what (if any) input a
 * quick action needs from the user:
 *   - `{}`               → no input; run the template as-is.
 *   - `text`             → a free-text field.
 *   - `row_from_table`   → pick one row from an ERP table. The admin selects the
 *     table, which columns to fetch (fed to the AI) and 1–2 columns to search on;
 *     `idColumn` identifies the chosen row. No hand-written SQL — the backend
 *     builds a safe `SELECT` from these validated identifiers.
 */
export const customInputSchema = z.union([
  z.object({}).strict(),
  z.object({
    type: z.literal("text"),
    label: z.string().min(1),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("row_from_table"),
    label: z.string().min(1),
    table: z.string().min(1),
    idColumn: z.string().min(1),
    fetchColumns: z.array(z.string().min(1)).min(1),
    searchColumns: z.array(z.string().min(1)).min(1).max(2),
    required: z.boolean().optional(),
  }),
]);

export type CustomInput =
  | Record<string, never>
  | { type: "text"; label: string; placeholder?: string; required?: boolean }
  | {
      type: "row_from_table";
      label: string;
      table: string;
      idColumn: string;
      fetchColumns: string[];
      searchColumns: string[];
      required?: boolean;
    };

/** Parses a stored `custom_input` blob; malformed config is treated as no input. */
export function parseCustomInput(raw: unknown): CustomInput {
  const result = customInputSchema.safeParse(raw ?? {});
  return result.success ? (result.data as CustomInput) : {};
}

/** A selectable option / row: `value` is submitted, `label` is shown. */
export interface QuickActionOption {
  value: string;
  label: string;
}

/**
 * Client-facing input descriptor. For `row_from_table` the rows are NOT embedded
 * here — the chat searches them lazily via `GET /api/quick-actions/:key/rows`.
 */
export interface QuickActionInputDto {
  type: "text" | "row_from_table";
  label: string;
  placeholder?: string;
  required: boolean;
}

export interface QuickActionDto {
  key: string;
  name: string;
  description: string | null;
  category: string | null;
  /** `null` when the action needs no input. */
  input: QuickActionInputDto | null;
  usesWebSearch: boolean;
}

/**
 * Builds the effective user message from a template and an input value. Every
 * `{placeholder}` (e.g. `{kontrahent}`) is replaced with the value; if the
 * template has no placeholder and a value is given, the value is appended.
 */
export function resolvePromptTemplate(
  template: string,
  value: string | null,
): string {
  const trimmed = (value ?? "").trim();
  if (/\{[^}]+\}/.test(template)) {
    return template.replace(/\{[^}]+\}/g, trimmed).trim();
  }
  return trimmed ? `${template} ${trimmed}`.trim() : template.trim();
}

/** Quotes a SQL identifier. Defense-in-depth — callers must still validate the
 * name against the table's real columns before using it. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Human-readable preview of the `SELECT` a `row_from_table` action runs for the
 * chosen row. Shared by the admin form (preview) and the run path (audit).
 */
export function buildFetchSql(config: {
  table: string;
  idColumn: string;
  fetchColumns: string[];
}): string {
  const cols = config.fetchColumns.map(quoteIdent).join(", ");
  return `SELECT ${cols}\nFROM ${quoteIdent(config.table)}\nWHERE ${quoteIdent(config.idColumn)} = :wybrany_wiersz`;
}

// ── Admin (CRUD) ─────────────────────────────────────────────────────────────

/** Full admin-facing view of a quick action (admins may see the prompt + config). */
export interface AdminQuickActionDto {
  id: number;
  key: string;
  namePl: string;
  descriptionPl: string | null;
  category: string | null;
  promptTemplate: string;
  customInput: CustomInput;
  usesDatabase: boolean;
  usesWebSearch: boolean;
  displayOrder: number;
  isEnabled: boolean;
}

/** Payload the admin form sends when creating/updating a quick action. */
export interface QuickActionPayload {
  key: string;
  namePl: string;
  promptTemplate: string;
  customInput: CustomInput;
  usesDatabase: boolean;
  usesWebSearch: boolean;
  displayOrder: number;
  isEnabled: boolean;
}

const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/, "Klucz może zawierać tylko małe litery, cyfry i podkreślenia.");

/** Validates a create request body. `customInput` defaults to `{}` (no input). */
export const adminQuickActionCreateSchema = z.object({
  key: keySchema,
  namePl: z.string().trim().min(1).max(120),
  descriptionPl: z.string().trim().max(500).nullish(),
  category: z.string().trim().max(80).nullish(),
  promptTemplate: z.string().trim().min(1).max(4000),
  customInput: customInputSchema.optional(),
  usesDatabase: z.boolean().optional(),
  usesWebSearch: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(9999).optional(),
  isEnabled: z.boolean().optional(),
});

/** Update accepts the same fields, all optional (only sent keys are changed). */
export const adminQuickActionUpdateSchema = adminQuickActionCreateSchema.partial();

/**
 * Maps a stored quick_actions row to the admin DTO. Accepts any object with the
 * needed fields (the Drizzle row has extras) so this file stays free of db imports.
 */
export function serializeAdminQuickAction(row: {
  id: number;
  key: string;
  namePl: string;
  descriptionPl: string | null;
  category: string | null;
  promptTemplate: string;
  customInput: unknown;
  usesDatabase: boolean;
  usesWebSearch: boolean;
  displayOrder: number;
  isEnabled: boolean;
}): AdminQuickActionDto {
  return {
    id: row.id,
    key: row.key,
    namePl: row.namePl,
    descriptionPl: row.descriptionPl,
    category: row.category,
    promptTemplate: row.promptTemplate,
    customInput: parseCustomInput(row.customInput),
    usesDatabase: row.usesDatabase,
    usesWebSearch: row.usesWebSearch,
    displayOrder: row.displayOrder,
    isEnabled: row.isEnabled,
  };
}
