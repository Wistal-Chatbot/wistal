import "server-only";

import {
  quoteIdent,
  type CustomInput,
  type QuickActionOption,
} from "@/lib/api/quick-actions-types";
import { executeReadOnly } from "@/lib/sql/execute";
import { getPublicSchema } from "@/lib/sql/introspection";

/**
 * Deterministic, read-only data source for `row_from_table` quick actions. The
 * admin picks a table + columns; here we validate those identifiers against the
 * live schema and build `SELECT`s ourselves — no admin-authored SQL. User input
 * (search term, chosen id) is always bound as a parameter, never interpolated.
 */

export type RowConfig = Extract<CustomInput, { type: "row_from_table" }>;

const TIMEOUT_MS = 10_000;
const SEARCH_LIMIT = 20;

interface ResolvedConfig {
  table: string;
  id: string;
  fetch: string[];
  search: string[];
}

/** Validates the config against the live schema and returns real column names. */
async function resolveConfig(config: RowConfig): Promise<ResolvedConfig> {
  const schema = await getPublicSchema();
  const info = schema.find(
    (t) => t.table.toLowerCase() === config.table.toLowerCase(),
  );
  if (!info) {
    throw new Error(`Tabela „${config.table}” jest niedostępna.`);
  }

  const byLower = new Map(info.columns.map((c) => [c.toLowerCase(), c]));
  const real = (name: string): string => {
    const column = byLower.get(name.toLowerCase());
    if (!column) throw new Error(`Nieznana kolumna „${name}”.`);
    return column;
  };

  return {
    table: info.table,
    id: real(config.idColumn),
    fetch: config.fetchColumns.map(real),
    search: config.searchColumns.map(real),
  };
}

/** Escapes LIKE wildcards so the user's text is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Searches the configured table on its 1–2 search columns (ILIKE), returning up
 * to `SEARCH_LIMIT` rows as `{ value: id, label }` for the chat combobox.
 */
export async function searchRows(
  config: RowConfig,
  query: string,
  limit = SEARCH_LIMIT,
): Promise<QuickActionOption[]> {
  const { table, id, search } = await resolveConfig(config);

  const selectCols = [
    `${quoteIdent(id)} AS id`,
    ...search.map((col, i) => `${quoteIdent(col)} AS s${i}`),
  ].join(", ");

  const term = query.trim();
  const where = term
    ? `WHERE ${search.map((col) => `${quoteIdent(col)}::text ILIKE $1`).join(" OR ")}`
    : "";
  // ORDER BY 2 = first search column (position 1 is the id).
  const sql = `SELECT DISTINCT ${selectCols} FROM ${quoteIdent(table)} ${where} ORDER BY 2 LIMIT ${Math.trunc(limit)}`;
  const params = term ? [`%${escapeLike(term)}%`] : [];

  const { rows } = await executeReadOnly(sql, { params, timeoutMs: TIMEOUT_MS });

  return rows.map((row) => {
    const label =
      search
        .map((_, i) => row[`s${i}`])
        .filter((v) => v !== null && v !== undefined)
        .map(String)
        .join(" — ") || String(row.id);
    return { value: String(row.id), label };
  });
}

/**
 * Fetches the single chosen row (only the admin-selected `fetchColumns`). Returns
 * the row object (real column names as keys) plus the executed SQL for auditing.
 */
export async function fetchRow(
  config: RowConfig,
  id: string,
): Promise<{ row: Record<string, unknown> | null; sql: string }> {
  const { table, id: idColumn, fetch } = await resolveConfig(config);

  const cols = fetch.map(quoteIdent).join(", ");
  const sql = `SELECT ${cols} FROM ${quoteIdent(table)} WHERE ${quoteIdent(idColumn)}::text = $1 LIMIT 1`;

  const { rows } = await executeReadOnly(sql, {
    params: [id],
    timeoutMs: TIMEOUT_MS,
  });

  return { row: rows[0] ?? null, sql };
}
