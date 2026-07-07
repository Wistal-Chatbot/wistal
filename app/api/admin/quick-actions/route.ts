import {
  adminQuickActionCreateSchema,
  serializeAdminQuickAction,
} from "@/lib/api/quick-actions-types";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createQuickAction, listAllQuickActions } from "@/lib/db/queries";
import { log } from "@/lib/log";

/** Postgres unique-violation (e.g. duplicate `key`). */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/** GET — every quick action (enabled or not) for the admin table. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rows = await listAllQuickActions();
  return Response.json({ actions: rows.map(serializeAdminQuickAction) });
}

/** POST — create a quick action. */
export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = adminQuickActionCreateSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Nieprawidłowe dane akcji." },
      { status: 400 },
    );
  }

  try {
    const row = await createQuickAction({
      ...parsed.data,
      customInput: parsed.data.customInput ?? {},
      createdBy: guard.user.id,
    });
    return Response.json(
      { action: serializeAdminQuickAction(row) },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json(
        { error: "Akcja o tym kluczu już istnieje." },
        { status: 409 },
      );
    }
    log.error("admin.quick-actions", "create failed", {
      key: parsed.data.key,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Nie udało się zapisać akcji." },
      { status: 500 },
    );
  }
}
