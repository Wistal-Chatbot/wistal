import { serializePublicAiReport } from "@/lib/api/ai-reports-types";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getActiveAiReports } from "@/lib/db/queries";

/** GET — active reports for the user-facing Raporty AI list. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const rows = await getActiveAiReports();
  return Response.json({ reports: rows.map(serializePublicAiReport) });
}
