import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import {
  aiReports,
  type AiReport,
  type NewAiReport,
} from "@/lib/db/schema";

// ── Admin CRUD ───────────────────────────────────────────────────────────────

/** Every report (draft or active) for the admin table, newest first. */
export async function listAiReports(): Promise<AiReport[]> {
  return db.select().from(aiReports).orderBy(desc(aiReports.createdAt));
}

/** Inserts a report and returns the created row. */
export async function createAiReport(input: NewAiReport): Promise<AiReport> {
  const [row] = await db.insert(aiReports).values(input).returning();
  return row;
}

/** Updates a report by id; returns the updated row or `null` if absent. */
export async function updateAiReport(
  id: string,
  patch: Partial<NewAiReport>,
): Promise<AiReport | null> {
  const [row] = await db
    .update(aiReports)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(aiReports.id, id))
    .returning();

  return row ?? null;
}

/** Deletes a report by id; returns whether a row was removed. */
export async function deleteAiReport(id: string): Promise<boolean> {
  const rows = await db
    .delete(aiReports)
    .where(eq(aiReports.id, id))
    .returning({ id: aiReports.id });

  return rows.length > 0;
}
