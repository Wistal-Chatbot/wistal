import { z } from "zod";

import { serializePublicAiReport } from "@/lib/api/ai-reports-types";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAiReportById } from "@/lib/db/queries";

const idSchema = z.string().uuid();

/** GET — one active report (params + metadata to build the run form). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Nie znaleziono raportu." }, { status: 404 });
  }

  const report = await getAiReportById(id);
  if (!report || !report.isActive) {
    return Response.json({ error: "Nie znaleziono raportu." }, { status: 404 });
  }

  return Response.json({ report: serializePublicAiReport(report) });
}
