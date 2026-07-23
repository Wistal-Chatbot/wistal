import { isPromptKey } from "@/lib/ai/prompt-defaults";
import { invalidatePromptCache } from "@/lib/ai/prompt-store";
import {
  promptSaveSchema,
  serializeAdminPrompt,
  serializePromptVersion,
} from "@/lib/api/prompts-types";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createPromptVersion, listPromptVersions } from "@/lib/db/queries";
import { log } from "@/lib/log";

/** Postgres unique-violation — two admins saved the same key concurrently. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

/** GET — one prompt's full version history, newest first. Admin-only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { key } = await params;
  if (!isPromptKey(key)) {
    return Response.json({ error: "Nie znaleziono promptu." }, { status: 404 });
  }

  const rows = await listPromptVersions(key);
  const versions = rows.map((row) =>
    serializePromptVersion(row, row.createdByEmail),
  );

  return Response.json({
    prompt: serializeAdminPrompt(
      key,
      rows[0] ?? null,
      rows[0]?.createdByEmail ?? null,
    ),
    versions,
  });
}

/**
 * PUT — save new prompt text as the next version, which becomes live.
 *
 * Reverting uses this same endpoint: the client sends the old version's content
 * back, which appends it as a new version. History is therefore append-only —
 * a revert is recorded rather than erasing what it replaced.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { key } = await params;
  if (!isPromptKey(key)) {
    return Response.json({ error: "Nie znaleziono promptu." }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = promptSaveSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Treść promptu nie może być pusta (maks. 20000 znaków)." },
      { status: 400 },
    );
  }

  try {
    const row = await createPromptVersion(
      key,
      parsed.data.content,
      guard.user.id,
    );
    // Make the edit visible on this instance now; others pick it up within the
    // cache TTL.
    invalidatePromptCache();

    log.info("admin.prompts", "prompt version saved", {
      key,
      version: row.version,
      userId: guard.user.id,
      chars: parsed.data.content.length,
    });

    return Response.json({
      prompt: serializeAdminPrompt(key, row, guard.user.email),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return Response.json(
        { error: "Prompt zmieniono w innej sesji. Odśwież i spróbuj ponownie." },
        { status: 409 },
      );
    }
    log.error("admin.prompts", "save failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Nie udało się zapisać promptu." },
      { status: 500 },
    );
  }
}
