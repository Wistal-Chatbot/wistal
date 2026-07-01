import "server-only";

import { client } from "@/lib/db/drizzle";

import { getPublicTableAllowlist } from "./allowlist";

/**
 * Live introspection of the `public` (ERP) schema so the admin can pick a table
 * and its columns instead of writing SQL. The ERP tables are external read-only
 * data (not in Drizzle), so we read `information_schema` directly. Cached with a
 * short TTL like the table allowlist.
 */

export interface PublicTableInfo {
  table: string;
  columns: string[];
  /** Single-column primary key, or `null` for composite / no PK. */
  primaryKey: string | null;
}

const TTL_MS = 5 * 60 * 1000;

let cache: { tables: PublicTableInfo[]; at: number } | null = null;

export async function getPublicSchema(): Promise<PublicTableInfo[]> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.tables;
  }

  const allowlist = await getPublicTableAllowlist();

  const columnRows = await client<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;

  const pkRows = await client<{ table_name: string; column_name: string }[]>`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'PRIMARY KEY'
  `;

  const byTable = new Map<string, { name: string; columns: string[] }>();
  for (const row of columnRows) {
    const key = row.table_name.toLowerCase();
    if (!allowlist.has(key)) continue; // BASE TABLE only (skip views)
    const entry = byTable.get(key) ?? { name: row.table_name, columns: [] };
    entry.columns.push(row.column_name);
    byTable.set(key, entry);
  }

  const pkByTable = new Map<string, string[]>();
  for (const row of pkRows) {
    const key = row.table_name.toLowerCase();
    const arr = pkByTable.get(key) ?? [];
    arr.push(row.column_name);
    pkByTable.set(key, arr);
  }

  const tables: PublicTableInfo[] = [...byTable.entries()]
    .map(([key, entry]) => {
      const pk = pkByTable.get(key) ?? [];
      return {
        table: entry.name,
        columns: entry.columns,
        primaryKey: pk.length === 1 ? pk[0] : null,
      };
    })
    .sort((a, b) => a.table.localeCompare(b.table));

  cache = { tables, at: Date.now() };
  return tables;
}

/** Real column names of a public table (empty if the table is unknown). */
export async function getPublicTableColumns(table: string): Promise<string[]> {
  const schema = await getPublicSchema();
  const match = schema.find(
    (t) => t.table.toLowerCase() === table.toLowerCase(),
  );
  return match?.columns ?? [];
}

/** Single-column primary key of a public table, or `null`. */
export async function getPublicTablePrimaryKey(
  table: string,
): Promise<string | null> {
  const schema = await getPublicSchema();
  const match = schema.find(
    (t) => t.table.toLowerCase() === table.toLowerCase(),
  );
  return match?.primaryKey ?? null;
}

export function clearPublicSchemaCache(): void {
  cache = null;
}
