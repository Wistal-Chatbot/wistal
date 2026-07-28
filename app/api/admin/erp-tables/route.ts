import type { ErpModelSavePayload } from "@/lib/api/erp-tables-types";
import { erpModelSaveSchema } from "@/lib/api/erp-tables-types";
import { requireAdmin } from "@/lib/auth/require-admin";
import { replaceErpModel } from "@/lib/db/queries";
import { getErpModel, invalidateErpModelCache } from "@/lib/erp-schema/store";
import { log } from "@/lib/log";
import { getPublicSchema } from "@/lib/sql/introspection";

/** GET — the current ERP tables model for the editor. Admin-only. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const tables = await getErpModel();
  return Response.json({ tables });
}

/**
 * Cross-checks the saved model against the live `public` schema and returns
 * non-blocking warnings. Read-only safety never depends on the model — the SQL
 * allowlist is derived live and the Dane browser drops unknown columns — so a
 * mistyped name is a quality issue to surface, not a reason to reject the save.
 */
async function schemaWarnings(model: ErpModelSavePayload): Promise<string[]> {
  const live = await getPublicSchema();
  const liveByTable = new Map(
    live.map((t) => [
      t.table.toLowerCase(),
      new Set(t.columns.map((c) => c.toLowerCase())),
    ]),
  );

  const warnings: string[] = [];
  for (const table of model.tables) {
    const liveCols = liveByTable.get(table.key.toLowerCase());
    if (!liveCols) {
      warnings.push(`Tabela „${table.key}” nie istnieje w bazie public.`);
      continue;
    }
    for (const col of table.columns) {
      if (!liveCols.has(col.name.toLowerCase())) {
        warnings.push(
          `Kolumna „${table.key}.${col.name}” nie istnieje w bazie public.`,
        );
      }
    }
  }
  return warnings;
}

/**
 * PUT — replace the whole ERP tables model. Validated, then written in one
 * transaction; the cache is invalidated so the edit is live on this instance now
 * and on other warm instances within the cache TTL.
 */
export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Nieprawidłowe żądanie." }, { status: 400 });
  }

  const parsed = erpModelSaveSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "Model tabel jest nieprawidłowy. Sprawdź nazwy i pola." },
      { status: 400 },
    );
  }

  // Reject duplicate table keys / column names up front — the DB unique
  // constraints would too, but a clear message beats a 500.
  const tableKeys = parsed.data.tables.map((t) => t.key.toLowerCase());
  if (new Set(tableKeys).size !== tableKeys.length) {
    return Response.json(
      { error: "Zduplikowany klucz tabeli." },
      { status: 400 },
    );
  }
  for (const table of parsed.data.tables) {
    const names = table.columns.map((c) => c.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      return Response.json(
        { error: `Zduplikowana kolumna w tabeli „${table.key}”.` },
        { status: 400 },
      );
    }
  }

  try {
    const warnings = await schemaWarnings(parsed.data);
    await replaceErpModel(parsed.data.tables);
    invalidateErpModelCache();

    log.info("admin.erp-tables", "model saved", {
      userId: guard.user.id,
      tables: parsed.data.tables.length,
      warnings: warnings.length,
    });

    return Response.json({ tables: parsed.data.tables, warnings });
  } catch (error) {
    log.error("admin.erp-tables", "save failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Nie udało się zapisać modelu tabel." },
      { status: 500 },
    );
  }
}
