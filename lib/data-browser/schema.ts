import "server-only";

import type { DataSchemaResponse, DataSchemaTable } from "@/lib/api/data-types";
import { getPublicSchema } from "@/lib/sql/introspection";

import { DATA_TABLES } from "./tables-config";

/**
 * Builds the `GET /api/data/schema` payload: the static browser config (labels +
 * per-column capabilities) reconciled with the live `public` schema. Reconciling
 * on every request keeps the two honest — a configured table/column that no longer
 * exists is silently dropped rather than advertised to the UI (and later rejected
 * by the query builder), and each table gets its live single-column primary key.
 */
export async function getDataBrowserSchema(): Promise<DataSchemaResponse> {
  const live = await getPublicSchema();
  const liveByTable = new Map(live.map((t) => [t.table.toLowerCase(), t]));

  const tables: DataSchemaTable[] = [];
  for (const cfg of DATA_TABLES) {
    const liveTable = liveByTable.get(cfg.key.toLowerCase());
    if (!liveTable) continue; // table not present / not in the allowlist

    const liveColumns = new Set(liveTable.columns.map((c) => c.toLowerCase()));
    const columns = cfg.columns
      .filter((col) => liveColumns.has(col.name.toLowerCase()))
      .map((col) => ({
        name: col.name,
        label: col.label,
        type: col.type,
        searchable: col.searchable,
        filterable: col.filterable,
        sortable: col.sortable,
      }));

    if (columns.length === 0) continue;

    tables.push({
      key: cfg.key,
      label: cfg.label,
      description: cfg.description,
      primaryKey: liveTable.primaryKey,
      columns,
    });
  }

  return { tables };
}
