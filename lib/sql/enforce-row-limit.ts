import "server-only";

/**
 * Wraps a validated SELECT so the database always caps the result set, even if
 * the model omitted a LIMIT. Architecture §6: `SELECT * FROM (<sql>) AS
 * __inner_query LIMIT 500`.
 */
export function enforceRowLimit(sql: string, limit = 500): string {
  const inner = sql.trim().replace(/;\s*$/, "");
  return `SELECT * FROM (${inner}) AS __inner_query LIMIT ${Math.trunc(limit)}`;
}
