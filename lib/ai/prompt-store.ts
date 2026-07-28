import "server-only";

import { getActivePrompts } from "@/lib/db/queries/system-prompts";
import { log } from "@/lib/log";

import {
  isStale,
  resolvePromptMap,
  type PromptCacheState,
  type PromptMap,
} from "./prompt-cache-core";
import { PROMPT_DEFAULTS, type PromptKey } from "./prompt-defaults";

/**
 * Read-through cache for the DB-stored prompts.
 *
 * Chat is latency-sensitive and the prompts change a few times a month, so we
 * do NOT read Neon per message. Instead:
 *   - the first read loads and caches the whole map;
 *   - once past the TTL the *stale* map is returned immediately and a refresh
 *     runs in the background, so no request ever blocks on the DB;
 *   - any failure degrades to the compiled-in defaults instead of throwing —
 *     a database blip must not take the chatbot down.
 *
 * Module state survives between requests on Vercel's Fluid Compute, so in
 * practice this is ~1 query/minute per warm instance.
 */
let cache: PromptCacheState | null = null;
/** Dedupes concurrent refreshes so a cold start fires one query, not N. */
let inFlight: Promise<PromptCacheState> | null = null;

async function loadFromDb(): Promise<PromptCacheState> {
  const rows = await getActivePrompts();
  return { prompts: resolvePromptMap(rows), fetchedAt: Date.now() };
}

function refresh(): Promise<PromptCacheState> {
  inFlight ??= loadFromDb()
    .then((state) => {
      cache = state;
      return state;
    })
    .catch((error) => {
      // Cache the fallback rather than leaving the cache empty: this bounds a
      // hard-down database to one retry per TTL instead of one per request,
      // while still recovering automatically once Neon is back.
      const state: PromptCacheState = {
        prompts: { ...PROMPT_DEFAULTS },
        fetchedAt: Date.now(),
      };
      cache = state;
      log.error("ai.prompts", "falling back to built-in prompts", {
        error: error instanceof Error ? error.message : String(error),
      });
      return state;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Every prompt, DB-backed where set and compiled-in otherwise. Never throws. */
export async function getPrompts(): Promise<PromptMap> {
  const current = cache;

  if (!current) {
    return (await refresh()).prompts;
  }

  if (isStale(current, Date.now())) {
    // Stale-while-revalidate: hand back what we have and refresh behind it.
    // The promise is intentionally not awaited; `refresh` swallows its errors.
    void refresh();
  }

  return current.prompts;
}

/** One prompt by key. */
export async function getPrompt(key: PromptKey): Promise<string> {
  return (await getPrompts())[key];
}

/**
 * Drops the cached map so the next read reloads. Call after an admin write, so
 * a save is visible immediately on this instance instead of up to a TTL later.
 * Other warm instances still converge within the TTL.
 */
export function invalidatePromptCache(): void {
  cache = null;
}
