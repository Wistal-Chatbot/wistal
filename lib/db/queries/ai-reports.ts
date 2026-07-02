import "server-only";

import { desc, eq, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import {
  aiReportExecutions,
  aiReports,
  appUsers,
  type AiReport,
  type AiReportExecution,
  type NewAiReport,
  type NewAiReportExecution,
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

// ── User-facing (run reports) ────────────────────────────────────────────────

/** Active reports for the user-facing list, newest first. */
export async function getActiveAiReports(): Promise<AiReport[]> {
  return db
    .select()
    .from(aiReports)
    .where(eq(aiReports.isActive, true))
    .orderBy(desc(aiReports.createdAt));
}

/** A single report by id, or `null` if none exists. */
export async function getAiReportById(id: string): Promise<AiReport | null> {
  const [row] = await db
    .select()
    .from(aiReports)
    .where(eq(aiReports.id, id))
    .limit(1);
  return row ?? null;
}

/** Records one report execution and returns the created row. */
export async function createAiReportExecution(
  input: NewAiReportExecution,
): Promise<AiReportExecution> {
  const [row] = await db.insert(aiReportExecutions).values(input).returning();
  return row;
}

export interface RecentExecutionRow {
  id: string;
  reportId: string;
  reportName: string;
  userName: string | null;
  userEmail: string | null;
  inputParams: unknown;
  status: string;
  createdAt: Date;
}

export interface AiReportExecutionDetailRow {
  id: string;
  reportId: string;
  reportName: string;
  userName: string | null;
  userEmail: string | null;
  inputParams: unknown;
  outputData: unknown;
  htmlWidget: string | null;
  sqlQueries: string[] | null;
  tokensUsed: number | null;
  executionMs: number | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
}

/** Recent report runs across ALL users, newest first (for the reports list). */
export async function listRecentExecutions(
  limit = 10,
): Promise<RecentExecutionRow[]> {
  return db
    .select({
      id: aiReportExecutions.id,
      reportId: aiReportExecutions.reportId,
      reportName: aiReports.name,
      userName: appUsers.name,
      userEmail: appUsers.email,
      inputParams: aiReportExecutions.inputParams,
      status: aiReportExecutions.status,
      createdAt: aiReportExecutions.createdAt,
    })
    .from(aiReportExecutions)
    .innerJoin(aiReports, eq(aiReportExecutions.reportId, aiReports.id))
    .leftJoin(appUsers, eq(aiReportExecutions.userId, appUsers.id))
    .orderBy(desc(aiReportExecutions.createdAt))
    .limit(limit);
}

/** Search saved report runs across ALL users by report, user, status, or input params. */
export async function searchAiReportExecutions(
  query: string,
  limit = 50,
): Promise<RecentExecutionRow[]> {
  const term = query.trim();
  const pattern = `%${term}%`;

  let statement = db
    .select({
      id: aiReportExecutions.id,
      reportId: aiReportExecutions.reportId,
      reportName: aiReports.name,
      userName: appUsers.name,
      userEmail: appUsers.email,
      inputParams: aiReportExecutions.inputParams,
      status: aiReportExecutions.status,
      createdAt: aiReportExecutions.createdAt,
    })
    .from(aiReportExecutions)
    .innerJoin(aiReports, eq(aiReportExecutions.reportId, aiReports.id))
    .leftJoin(appUsers, eq(aiReportExecutions.userId, appUsers.id))
    .$dynamic();

  if (term) {
    statement = statement.where(
      or(
        sql`${aiReports.name} ILIKE ${pattern}`,
        sql`${appUsers.name} ILIKE ${pattern}`,
        sql`${appUsers.email} ILIKE ${pattern}`,
        sql`${aiReportExecutions.status} ILIKE ${pattern}`,
        sql`${aiReportExecutions.inputParams}::text ILIKE ${pattern}`,
      ),
    );
  }

  return statement
    .orderBy(desc(aiReportExecutions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

/** One saved report run, joined with report/user data for the result view. */
export async function getAiReportExecutionById(
  id: string,
): Promise<AiReportExecutionDetailRow | null> {
  const [row] = await db
    .select({
      id: aiReportExecutions.id,
      reportId: aiReportExecutions.reportId,
      reportName: aiReports.name,
      userName: appUsers.name,
      userEmail: appUsers.email,
      inputParams: aiReportExecutions.inputParams,
      outputData: aiReportExecutions.outputData,
      htmlWidget: aiReports.htmlWidget,
      sqlQueries: aiReportExecutions.sqlQueries,
      tokensUsed: aiReportExecutions.tokensUsed,
      executionMs: aiReportExecutions.executionMs,
      status: aiReportExecutions.status,
      errorMessage: aiReportExecutions.errorMessage,
      createdAt: aiReportExecutions.createdAt,
    })
    .from(aiReportExecutions)
    .innerJoin(aiReports, eq(aiReportExecutions.reportId, aiReports.id))
    .leftJoin(appUsers, eq(aiReportExecutions.userId, appUsers.id))
    .where(eq(aiReportExecutions.id, id))
    .limit(1);

  return row ?? null;
}
