import "server-only";

import { getErpModelRows } from "@/lib/db/queries/erp-tables";
import { log } from "@/lib/log";

import {
  renderErpSchemaText,
  resolveErpModel,
  toDataTables,
} from "./erp-schema-core";
import {
  DEFAULT_ERP_MODEL,
  type DataTableConfig,
  type ErpTableModel,
} from "./model";

/**
 * Read-through cache for the DB-stored ERP tables model — the same design as
 * `prompt-store.ts`:
 *   - the first read loads and caches the whole model;
 *   - past the TTL the *stale* model is returned immediately and a refresh runs
 *     in the background, so no chat/browser request ever blocks on the DB;
 *   - any failure degrades to `DEFAULT_ERP_MODEL` instead of throwing, so a
 *     database blip never takes chat, reports, or the Dane browser down.
 *
 * Module state survives between requests on Vercel's Fluid Compute, so in
 * practice this is ~1 query/minute per warm instance.
 */
const CACHE_TTL_MS = 60_000;

interface ErpModelCacheState {
  model: ErpTableModel[];
  fetchedAt: number;
}

let cache: ErpModelCacheState | null = null;
/** Dedupes concurrent refreshes so a cold start fires one query, not N. */
let inFlight: Promise<ErpModelCacheState> | null = null;

async function loadFromDb(): Promise<ErpModelCacheState> {
  const { tables, columns } = await getErpModelRows();
  return { model: resolveErpModel(tables, columns), fetchedAt: Date.now() };
}

function refresh(): Promise<ErpModelCacheState> {
  inFlight ??= loadFromDb()
    .then((state) => {
      cache = state;
      return state;
    })
    .catch((error) => {
      // Cache the fallback rather than leaving the cache empty: bounds a hard-down
      // database to one retry per TTL, while still recovering once Neon is back.
      const state: ErpModelCacheState = {
        model: DEFAULT_ERP_MODEL,
        fetchedAt: Date.now(),
      };
      cache = state;
      log.error("erp.schema", "falling back to built-in ERP model", {
        error: error instanceof Error ? error.message : String(error),
      });
      return state;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** The ERP tables model, DB-backed where seeded and compiled-in otherwise. Never throws. */
export async function getErpModel(): Promise<ErpTableModel[]> {
  const current = cache;

  if (!current) {
    return (await refresh()).model;
  }

  if (Date.now() - current.fetchedAt >= CACHE_TTL_MS) {
    // Stale-while-revalidate: hand back what we have and refresh behind it.
    void refresh();
  }

  return current.model;
}

/** The `{{ERP_SCHEMA}}` markdown the AI prompts inject. */
export async function getErpSchemaText(): Promise<string> {
  return renderErpSchemaText(await getErpModel());
}

/** The Dane browser config derived from the model. */
export async function getDataTables(): Promise<DataTableConfig[]> {
  return toDataTables(await getErpModel());
}

/**
 * Drops the cached model so the next read reloads. Call after an admin write, so
 * a save is visible immediately on this instance instead of up to a TTL later.
 * Other warm instances still converge within the TTL.
 */
export function invalidateErpModelCache(): void {
  cache = null;
}
