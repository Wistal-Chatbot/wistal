import { PROMPT_KEYS } from "@/lib/ai/prompt-defaults";
import { serializeAdminPrompt } from "@/lib/api/prompts-types";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getActivePromptsForAdmin } from "@/lib/db/queries";

/**
 * GET — every editable prompt with its live text and version. Keys never edited
 * since deploy have no row yet and come back with `version: null` and the
 * compiled-in default as `content`. Admin-only.
 */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rows = await getActivePromptsForAdmin();
  const byKey = new Map(rows.map((row) => [row.key, row]));

  const prompts = PROMPT_KEYS.map((key) => {
    const row = byKey.get(key) ?? null;
    return serializeAdminPrompt(key, row, row?.createdByEmail ?? null);
  });

  return Response.json({ prompts });
}
