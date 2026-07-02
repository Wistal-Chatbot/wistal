import type { AiReportRunDto } from "@/lib/api/ai-reports-types";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listRecentExecutions } from "@/lib/db/queries";

/** GET — recent report runs across all users (for "Ostatnie uruchomienia"). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const rows = await listRecentExecutions(10);
  const runs: AiReportRunDto[] = rows.map((r) => ({
    id: r.id,
    reportId: r.reportId,
    reportName: r.reportName,
    userName: r.userName ?? r.userEmail ?? null,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
  return Response.json({ runs });
}
