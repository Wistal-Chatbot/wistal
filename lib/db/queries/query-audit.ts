import "server-only";

import { db } from "@/lib/db/drizzle";
import { queryAudit, type NewQueryAudit } from "@/lib/db/schema";

/**
 * Records one audited query (architecture §6). Never pass returned row data or
 * PII here — only the input, SQL, tables, counts, and timings. Returns the new
 * audit row id so it can be linked from the assistant message metadata.
 */
export async function insertQueryAudit(row: NewQueryAudit): Promise<number> {
  const [inserted] = await db
    .insert(queryAudit)
    .values(row)
    .returning({ id: queryAudit.id });
  return inserted.id;
}
