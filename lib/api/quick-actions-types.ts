/**
 * Wire shapes and the `quick_actions.custom_input` contract. Kept free of
 * `server-only`/`db` imports (like `chat-types.ts`) so both the route handlers
 * and the client can share these types. The server-only pieces that touch SQL
 * (resolving `select_from_db` options, validating input) live in
 * `lib/quick-actions/resolve.ts`.
 */

import { z } from "zod";

/**
 * `quick_actions.custom_input` is a JSONB blob describing what (if any) input a
 * quick action needs from the user:
 *   - `{}`               → no input; run the template as-is.
 *   - `text`             → a free-text field.
 *   - `select_from_db`   → a dropdown whose options come from a read-only SELECT.
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
    type: z.literal("select_from_db"),
    label: z.string().min(1),
    query: z.string().min(1),
    valueColumn: z.string().min(1),
    labelColumn: z.string().optional(),
    required: z.boolean().optional(),
  }),
]);

export type CustomInput =
  | Record<string, never>
  | { type: "text"; label: string; placeholder?: string; required?: boolean }
  | {
      type: "select_from_db";
      label: string;
      query: string;
      valueColumn: string;
      labelColumn?: string;
      required?: boolean;
    };

/** Parses a stored `custom_input` blob; malformed config is treated as no input. */
export function parseCustomInput(raw: unknown): CustomInput {
  const result = customInputSchema.safeParse(raw ?? {});
  return result.success ? (result.data as CustomInput) : {};
}

export interface QuickActionOption {
  value: string;
  label: string;
}

/** Client-facing input descriptor. Never exposes the raw `select_from_db` query. */
export interface QuickActionInputDto {
  type: "text" | "select_from_db";
  label: string;
  placeholder?: string;
  required: boolean;
  /** Present for `select_from_db`; resolved server-side. */
  options?: QuickActionOption[];
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

// ── Admin (CRUD) ─────────────────────────────────────────────────────────────

/** Full admin-facing view of a quick action (admins may see the prompt + query). */
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
