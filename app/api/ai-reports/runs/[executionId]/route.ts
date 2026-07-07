import { z } from "zod";

import type { AiReportExecutionDetailDto } from "@/lib/api/ai-reports-types";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAiReportExecutionById } from "@/lib/db/queries";

const idSchema = z.string().uuid();

/** GET — one saved report execution for the result view. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ executionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const { executionId } = await params;
  if (!idSchema.safeParse(executionId).success) {
    return Response.json({ error: "Nie znaleziono uruchomienia raportu." }, { status: 404 });
  }

  const row = await getAiReportExecutionById(executionId);
  if (!row) {
    return Response.json({ error: "Nie znaleziono uruchomienia raportu." }, { status: 404 });
  }

  const execution: AiReportExecutionDetailDto = {
    id: row.id,
    reportId: row.reportId,
    reportName: row.reportName,
    userName: row.userName ?? row.userEmail ?? null,
    inputParams: row.inputParams,
    outputData: row.outputData,
    htmlWidget: row.htmlWidget,
    sqlQueries: row.sqlQueries ?? [],
    tokensUsed: row.tokensUsed,
    executionMs: row.executionMs,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };

  return Response.json({ execution });
}
