import { z } from "zod";

import {
  adminAiReportUpdateSchema,
  serializeAdminAiReport,
} from "@/lib/api/ai-reports-types";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteAiReport, updateAiReport } from "@/lib/db/queries";
import { log } from "@/lib/log";

const idSchema = z.string().uuid();

/** PATCH — edit fields and/or activate a report. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Nie znaleziono raportu." }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = adminAiReportUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Nieprawidłowe dane raportu." },
      { status: 400 },
    );
  }

  try {
    const row = await updateAiReport(id, parsed.data);
    if (!row) {
      return Response.json(
        { error: "Nie znaleziono raportu." },
        { status: 404 },
      );
    }
    return Response.json({ report: serializeAdminAiReport(row) });
  } catch (error) {
    log.error("admin.ai-reports", "update failed", {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Nie udało się zapisać raportu." },
      { status: 500 },
    );
  }
}

/** DELETE — remove a report. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Nie znaleziono raportu." }, { status: 404 });
  }

  const removed = await deleteAiReport(id);
  if (!removed) {
    return Response.json({ error: "Nie znaleziono raportu." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
