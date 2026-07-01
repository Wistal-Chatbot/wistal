import { dataQueryRequestSchema } from "@/lib/api/data-types";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  DataExecutionError,
  DataQueryError,
  runDataQuery,
} from "@/lib/data-browser/query";
import { insertQueryAudit } from "@/lib/db/queries";
import { log } from "@/lib/log";

/** POST — run a parametrized SELECT for the manual data browser (Dane): structured
 * table + global_search + filters + sort + pagination. Any signed-in user. Every
 * executed query is audited with `source='manual_browser'`. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Brak autoryzacji." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = dataQueryRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Nieprawidłowe parametry zapytania." },
      { status: 400 },
    );
  }

  try {
    const result = await runDataQuery(parsed.data);

    await insertQueryAudit({
      userId: user.id,
      source: "manual_browser",
      sqlExecuted: result.sqlExecuted,
      sqlValid: true,
      tablesUsed: result.tablesUsed,
      rowCount: result.rowCount,
      executionMs: result.executionMs,
    }).catch((error) => {
      // Auditing must never break the response; log and move on.
      log.error("data.query", "audit insert failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return Response.json({
      rows: result.rows,
      has_more: result.hasMore,
      page: result.page,
      page_size: result.pageSize,
    });
  } catch (error) {
    if (error instanceof DataQueryError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof DataExecutionError) {
      await insertQueryAudit({
        userId: user.id,
        source: "manual_browser",
        sqlExecuted: error.sqlExecuted,
        sqlValid: true,
        tablesUsed: error.tablesUsed,
        errorMessage: error.message,
      }).catch(() => {});
      log.error("data.query", "execution failed", {
        table: parsed.data.table,
        error: error.message,
      });
      return Response.json(
        { error: "Nie udało się wykonać zapytania." },
        { status: 500 },
      );
    }

    log.error("data.query", "unexpected error", {
      table: parsed.data.table,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Nie udało się wykonać zapytania." },
      { status: 500 },
    );
  }
}
