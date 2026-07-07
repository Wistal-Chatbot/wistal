import { getCurrentUser } from "@/lib/auth/current-user";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { parseCustomInput } from "@/lib/api/quick-actions-types";
import { getQuickActionByKey } from "@/lib/db/queries";
import { log } from "@/lib/log";
import { searchRows } from "@/lib/quick-actions/row-source";

/** GET — searches the rows of a `row_from_table` quick action (for the chat
 * combobox). `?q=` filters on the action's 1–2 search columns (ILIKE). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  const { key } = await params;

  // Light rate limit — this is called on every keystroke (debounced).
  const limit = await checkRateLimit({
    namespace: "quick-actions-rows",
    key: `user:${user.id}:minute`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: "Zbyt wiele zapytań. Spróbuj ponownie później." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const action = await getQuickActionByKey(key);
  if (!action || !action.isEnabled) {
    return Response.json({ error: "Nie znaleziono akcji." }, { status: 404 });
  }

  const config = parseCustomInput(action.customInput);
  if (!("type" in config) || config.type !== "row_from_table") {
    return Response.json(
      { error: "Akcja nie korzysta z listy z bazy." },
      { status: 400 },
    );
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";

  try {
    const rows = await searchRows(config, query);
    return Response.json({ rows });
  } catch (error) {
    log.error("quick-actions.rows", "search failed", {
      key,
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Nie udało się wyszukać danych." },
      { status: 502 },
    );
  }
}
