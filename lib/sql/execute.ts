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
 */
export async function executeReadOnly(
  sql: string,
  opts?: { timeoutMs?: number },
): Promise<ExecuteResult> {
  const timeoutMs = Math.trunc(opts?.timeoutMs ?? 10_000);
  const start = Date.now();

  const rows = await client.begin(async (tx) => {
    // READ ONLY must be set before any query runs in the transaction.
    await tx.unsafe("SET TRANSACTION READ ONLY");
    await tx.unsafe(`SET LOCAL statement_timeout = ${timeoutMs}`);
    return tx.unsafe(sql);
  });

  return {
    rows: rows as unknown as Record<string, unknown>[],
    executionMs: Date.now() - start,
  };
}
