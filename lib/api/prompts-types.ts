/**
 * Wire shapes for the admin prompt editor. Kept free of `server-only`/`db`
 * imports (like `quick-actions-types.ts`) so the route handlers and the client
 * component can share them.
 */

import { z } from "zod";

import {
  PROMPT_DEFAULTS,
  PROMPT_META,
  type PromptKey,
} from "@/lib/ai/prompt-defaults";

/**
 * 20k chars is roughly the `ai_reports.system_prompt` ceiling and well above the
 * ~8k the shipped chat prompt needs — a guard against a runaway paste, not a
 * budget the admin should be tuning against.
 */
export const promptSaveSchema = z.object({
  content: z.string().trim().min(1).max(20000),
});

export type PromptSavePayload = z.infer<typeof promptSaveSchema>;

/** One stored version, for the history list. */
export interface PromptVersionDto {
  id: number;
  version: number;
  content: string;
  createdAt: string;
  /** Email of the editor; null for the seeded version or a deleted user. */
  createdByEmail: string | null;
}

/** A prompt as the admin UI sees it: live text plus where it came from. */
export interface AdminPromptDto {
  key: PromptKey;
  label: string;
  description: string;
  supportsSchemaPlaceholder: boolean;
  content: string;
  /** The shipped wording, so the UI can offer "reset to default" and a diff. */
  defaultContent: string;
  /** Null when no row exists yet and `content` is the compiled-in default. */
  version: number | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

export interface PromptRow {
  id: number;
  key: string;
  content: string;
  version: number;
  createdAt: Date;
}

export function serializePromptVersion(
  row: PromptRow,
  createdByEmail: string | null,
): PromptVersionDto {
  return {
    id: row.id,
    version: row.version,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    createdByEmail,
  };
}

/**
 * Merges the live DB row (if any) with the static registry entry, so the client
 * gets one uniform shape whether or not a prompt has ever been edited.
 */
export function serializeAdminPrompt(
  key: PromptKey,
  row: PromptRow | null,
  updatedByEmail: string | null,
): AdminPromptDto {
  const meta = PROMPT_META[key];
  return {
    key,
    label: meta.label,
    description: meta.description,
    supportsSchemaPlaceholder: meta.supportsSchemaPlaceholder,
    content: row?.content ?? PROMPT_DEFAULTS[key],
    defaultContent: PROMPT_DEFAULTS[key],
    version: row?.version ?? null,
    updatedAt: row?.createdAt.toISOString() ?? null,
    updatedByEmail: row ? updatedByEmail : null,
  };
}
