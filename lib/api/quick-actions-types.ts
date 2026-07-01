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
