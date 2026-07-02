import { z } from "zod";

import type { AiReportRunDto } from "@/lib/api/ai-reports-types";
import { getCurrentUser } from "@/lib/auth/current-user";
import { searchAiReportExecutions } from "@/lib/db/queries";

const searchParamsSchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

/** GET — search saved report executions across all users. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const parsed = searchParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return Response.json({ error: "Nieprawidłowe parametry wyszukiwania." }, { status: 400 });
  }

  const rows = await searchAiReportExecutions(parsed.data.q, parsed.data.limit);
  const runs: AiReportRunDto[] = rows.map((r) => ({
    id: r.id,
    reportId: r.reportId,
    reportName: r.reportName,
    userName: r.userName ?? r.userEmail ?? null,
    inputParams: r.inputParams,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));

  return Response.json({ runs });
}
