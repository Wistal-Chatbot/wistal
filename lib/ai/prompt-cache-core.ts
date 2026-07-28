/**
 * Pure helpers behind `prompt-store.ts`, split out (like `token-usage-core.ts`)
 * so the cache and fallback rules can be unit-tested without a DB or `server-only`.
 */

import {
  ERP_SCHEMA_PLACEHOLDER,
  PROMPT_DEFAULTS,
  PROMPT_KEYS,
  type PromptKey,
} from "./prompt-defaults";

/**
 * How long a loaded prompt map is served before a refresh is triggered.
 *
 * 60s matches the prompt-management convention (Langfuse uses the same default):
 * short enough that an admin's edit goes live within a minute, long enough that
 * Neon sees ~1 query/minute per instance instead of one per chat message.
 * Refreshes are stale-while-revalidate, so no request ever waits on the DB.
 */
export const PROMPT_CACHE_TTL_MS = 60_000;

export type PromptMap = Record<PromptKey, string>;

export interface PromptCacheState {
  prompts: PromptMap;
  fetchedAt: number;
}

/** True once `state` is older than the TTL and a background refresh is due. */
export function isStale(
  state: PromptCacheState,
  now: number,
  ttlMs: number = PROMPT_CACHE_TTL_MS,
): boolean {
  return now - state.fetchedAt >= ttlMs;
}

/**
 * Builds the full prompt map from whatever rows the DB returned, falling back
 * to the compiled-in default for any key that is missing, unknown, or blank.
 *
 * Every key always resolves to usable text — a partially-seeded table or a row
 * saved as whitespace degrades to the shipped wording rather than sending the
 * model an empty system prompt.
 */
export function resolvePromptMap(
  rows: ReadonlyArray<{ key: string; content: string }>,
): PromptMap {
  const stored = new Map(rows.map((row) => [row.key, row.content]));
  const prompts = {} as PromptMap;

  for (const key of PROMPT_KEYS) {
    const content = stored.get(key);
    prompts[key] =
      typeof content === "string" && content.trim().length > 0
        ? content
        : PROMPT_DEFAULTS[key];
  }

  return prompts;
}

/**
 * Substitutes the ERP schema into a prompt. The schema stays code-owned, so an
 * admin edit can move the placeholder around but can't let the schema drift
 * from the real tables. A prompt without the placeholder is returned unchanged.
 */
export function expandSchemaPlaceholder(
  text: string,
  schema: string,
): string {
  return text.split(ERP_SCHEMA_PLACEHOLDER).join(schema);
}
