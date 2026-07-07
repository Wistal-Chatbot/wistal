import "server-only";

import { client } from "@/lib/db/drizzle";

export interface ExecuteResult {
  rows: Record<string, unknown>[];
  executionMs: number;
}

/**
 * Runs already-validated, row-limited SELECT SQL against Neon. Defense in depth:
 * the statement runs inside a `READ ONLY` transaction with a `statement_timeout`,
 * so even SQL that slipped past the validator can neither write nor run long.
 *
 * `params` are bound positionally (`$1`, `$2`, …) — use them for any user-supplied
 * value so it is never interpolated into the SQL string.
 */
export async function executeReadOnly(
  sql: string,
  opts?: { timeoutMs?: number; params?: unknown[] },
): Promise<ExecuteResult> {
  const timeoutMs = Math.trunc(opts?.timeoutMs ?? 10_000);
  const start = Date.now();

  const rows = await client.begin(async (tx) => {
    // READ ONLY must be set before any query runs in the transaction.
    await tx.unsafe("SET TRANSACTION READ ONLY");
    await tx.unsafe(`SET LOCAL statement_timeout = ${timeoutMs}`);
    return tx.unsafe(sql, (opts?.params ?? []) as never[]);
  });

  return {
    rows: rows as unknown as Record<string, unknown>[],
    executionMs: Date.now() - start,
  };
}
