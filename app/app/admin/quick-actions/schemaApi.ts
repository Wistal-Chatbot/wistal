/** Public (ERP) table metadata for the quick-action builder. */
export interface DbTable {
  table: string;
  columns: string[];
  primaryKey: string | null;
}

/** Fetches the ERP schema (tables + columns + PK). Admin-only endpoint. */
export async function fetchDbSchema(): Promise<DbTable[]> {
  const res = await fetch("/api/admin/schema", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Nie udało się wczytać schematu bazy.");
  }
  const data = (await res.json()) as { tables: DbTable[] };
  return data.tables;
}
