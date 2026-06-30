import "server-only";

import { Parser } from "node-sql-parser";

/**
 * Read-only SQL validator for model-generated SQL (architecture §6). Layers:
 *   1. dangerous keyword/function blocklist (on string-literal-scrubbed SQL),
 *   2. AST parse — must be exactly one statement and a SELECT,
 *   3. table allowlist — every referenced table must live in `public` and be in
 *      the dynamic allowlist (so `chatbot.*` and system schemas are blocked).
 * Execution additionally runs inside a READ ONLY transaction (see execute.ts).
 */

const parser = new Parser();
const PARSE_OPTS = { database: "postgresql" } as const;

// Word-boundary blocklist of write/DDL keywords and dangerous functions.
const BLOCKED =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|exec|execute|merge|call|copy|vacuum|reindex|cluster|comment|reset|listen|notify|lock|prepare|deallocate|dblink|lo_import|lo_export|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|pg_sleep|pg_cancel_backend|pg_terminate_backend|current_setting|set_config|pg_reload_conf)\b/i;

export type ValidationResult =
  | { ok: true; tablesUsed: string[] }
  | { ok: false; error: string };

export function validateSql(
  rawSql: string,
  allowlist: Set<string>,
): ValidationResult {
  const sql = rawSql.trim();
  if (!sql) {
    return { ok: false, error: "Puste zapytanie." };
  }

  // Scrub single-quoted string literals so a product name like 'Set 5mm'
  // doesn't trip the keyword blocklist.
  const scrubbed = sql.replace(/'(?:[^']|'')*'/g, "''");
  if (BLOCKED.test(scrubbed)) {
    return {
      ok: false,
      error:
        "Zapytanie zawiera niedozwolone słowo kluczowe lub funkcję. Dozwolone są wyłącznie zapytania SELECT.",
    };
  }

  let ast: ReturnType<Parser["astify"]>;
  try {
    ast = parser.astify(sql, PARSE_OPTS);
  } catch {
    return { ok: false, error: "Nie udało się sparsować zapytania SQL." };
  }

  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1) {
    return { ok: false, error: "Dozwolone jest tylko jedno zapytanie SELECT." };
  }
  if (statements[0]?.type !== "select") {
    return { ok: false, error: "Dozwolone są wyłącznie zapytania SELECT." };
  }

  let tableList: string[];
  try {
    // Entries have the form "type::db::table" (db is "null" when unqualified).
    tableList = parser.tableList(sql, PARSE_OPTS);
  } catch {
    return { ok: false, error: "Nie udało się odczytać tabel z zapytania." };
  }

  const tablesUsed: string[] = [];
  for (const entry of tableList) {
    const [op, schema, table] = entry.split("::");
    if (op !== "select") {
      return {
        ok: false,
        error: "Zapytanie modyfikuje dane — dozwolony jest tylko odczyt.",
      };
    }
    if (schema && schema !== "null" && schema !== "public") {
      return {
        ok: false,
        error: `Dostęp do schematu '${schema}' jest zabroniony — dozwolony jest tylko 'public'.`,
      };
    }
    const name = (table ?? "").toLowerCase();
    if (!allowlist.has(name)) {
      return { ok: false, error: `Tabela '${table}' nie jest dostępna.` };
    }
    tablesUsed.push(name);
  }

  if (tablesUsed.length === 0) {
    return {
      ok: false,
      error: "Zapytanie nie odwołuje się do żadnej dozwolonej tabeli.",
    };
  }

  return { ok: true, tablesUsed: [...new Set(tablesUsed)] };
}
