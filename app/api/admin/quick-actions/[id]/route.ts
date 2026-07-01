import { z } from "zod";

import {
  adminQuickActionUpdateSchema,
  serializeAdminQuickAction,
} from "@/lib/api/quick-actions-types";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteQuickAction, updateQuickAction } from "@/lib/db/queries";
import { log } from "@/lib/log";

const idSchema = z.coerce.number().int().positive();

/** Postgres unique-violation (e.g. renaming to an existing `key`). */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/** PATCH — update an existing quick action. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "Nie znaleziono akcji." }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = adminQuickActionUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Nieprawidłowe dane akcji." },
      { status: 400 },
    );
  }

  try {
    const row = await updateQuickAction(parsedId.data, parsed.data);
    if (!row) {
      return Response.json({ error: "Nie znaleziono akcji." }, { status: 404 });
    }
    return Response.json({ action: serializeAdminQuickAction(row) });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json(
        { error: "Akcja o tym kluczu już istnieje." },
        { status: 409 },
      );
    }
    log.error("admin.quick-actions", "update failed", {
      id: parsedId.data,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Nie udało się zapisać akcji." },
      { status: 500 },
    );
  }
}

/** DELETE — remove a quick action. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "Nie znaleziono akcji." }, { status: 404 });
  }

  const removed = await deleteQuickAction(parsedId.data);
  if (!removed) {
    return Response.json({ error: "Nie znaleziono akcji." }, { status: 404 });
  }

  return Response.json({ ok: true });
}
