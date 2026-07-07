import { serializeAdminAiReport } from "@/lib/api/ai-reports-types";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listAiReports } from "@/lib/db/queries";

/** GET — every AI report (draft or active) for the admin table. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rows = await listAiReports();
  return Response.json({ reports: rows.map(serializeAdminAiReport) });
}
