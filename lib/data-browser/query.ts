import "server-only";

import { quoteIdent } from "@/lib/api/quick-actions-types";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type DataQueryRequest,
  type FilterOperator,
} from "@/lib/api/data-types";
import { executeReadOnly } from "@/lib/sql/execute";
import { getPublicSchema } from "@/lib/sql/introspection";

import { getTableConfig, type DataColumnConfig } from "./tables-config";

/**
 * Deterministic, read-only query builder for the manual data browser. Like
 * `lib/quick-actions/row-source.ts`, it accepts NO client SQL: the caller sends a
 * table + structured search/filter/sort, and we validate every identifier against
 * both the static config and the live `public` schema, build the `SELECT`
 * ourselves, and bind all user values as parameters. Executed via `executeReadOnly`
 * inside a `READ ONLY` transaction with a statement timeout.
 */

const TIMEOUT_MS = 10_000;

/** SQL for the comparison operators (`like` is handled separately as ILIKE). */
const COMPARISON_SQL: Record<Exclude<FilterOperator, "like">, string> = {
  eq: "=",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
};

/** A bad request (unknown table/column, wrong capability, bad value) → HTTP 400. */
export class DataQueryError extends Error {}

/** An error while executing the built query → HTTP 500; carries audit context. */
export class DataExecutionError extends Error {
  readonly sqlExecuted: string;
  readonly tablesUsed: string[];
  constructor(
    message: string,
    ctx: { sqlExecuted: string; tablesUsed: string[]; cause?: unknown },
  ) {
    super(message, { cause: ctx.cause });
    this.sqlExecuted = ctx.sqlExecuted;
    this.tablesUsed = ctx.tablesUsed;
  }
}

export interface DataQueryResult {
  rows: Record<string, unknown>[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  sqlExecuted: string;
  tablesUsed: string[];
  rowCount: number;
  executionMs: number;
}

/** Escapes LIKE wildcards so the user's text is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function isNumericValue(value: string | number): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  return value.trim() !== "" && !Number.isNaN(Number(value));
}

function isDateValue(value: string | number): boolean {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export async function runDataQuery(
  input: DataQueryRequest,
): Promise<DataQueryResult> {
  const cfg = getTableConfig(input.table);
  const live = await getPublicSchema();
  const liveTable = cfg
    ? live.find((t) => t.table.toLowerCase() === cfg.key.toLowerCase())
    : undefined;
  if (!cfg || !liveTable) {
    throw new DataQueryError(`Tabela „${input.table}” jest niedostępna.`);
  }

  // Real column names keyed by lowercase, plus config (capabilities) by lowercase.
  const liveByLower = new Map(
    liveTable.columns.map((c) => [c.toLowerCase(), c]),
  );
  const configByLower = new Map(
    cfg.columns.map((c) => [c.name.toLowerCase(), c]),
  );

  /** Resolves a client column name to its real name, enforcing a capability. */
  const resolve = (
    name: string,
    capability: "filterable" | "sortable",
  ): { real: string; config: DataColumnConfig } => {
    const config = configByLower.get(name.toLowerCase());
    const real = config && liveByLower.get(config.name.toLowerCase());
    if (!config || !real) {
      throw new DataQueryError(`Nieznana kolumna „${name}”.`);
    }
    if (capability === "filterable" && !config.filterable) {
      throw new DataQueryError(`Kolumna „${name}” nie obsługuje filtrowania.`);
    }
    if (capability === "sortable" && !config.sortable) {
      throw new DataQueryError(`Kolumna „${name}” nie obsługuje sortowania.`);
    }
    return { real, config };
  };

  // ── SELECT list: the configured columns that still exist in the live table ──
  const displayColumns = cfg.columns
    .map((c) => liveByLower.get(c.name.toLowerCase()))
    .filter((real): real is string => Boolean(real));
  if (displayColumns.length === 0) {
    throw new DataQueryError(`Tabela „${input.table}” jest niedostępna.`);
  }
  const selectSql = displayColumns.map(quoteIdent).join(", ");

  const params: unknown[] = [];
  const whereClauses: string[] = [];

  // ── global_search: OR-ed ILIKE across the searchable columns ────────────────
  const term = input.global_search?.trim();
  if (term) {
    const searchCols = cfg.columns.filter(
      (c) => c.searchable && liveByLower.has(c.name.toLowerCase()),
    );
    if (searchCols.length > 0) {
      params.push(`%${escapeLike(term)}%`);
      const n = params.length;
      const ors = searchCols.map((c) => {
        const real = liveByLower.get(c.name.toLowerCase()) as string;
        return `${quoteIdent(real)}::text ILIKE $${n}`;
      });
      whereClauses.push(`(${ors.join(" OR ")})`);
    }
  }

  // ── filters: one bound comparison each ──────────────────────────────────────
  for (const filter of input.filters ?? []) {
    const { real, config } = resolve(filter.column, "filterable");

    if (filter.operator === "like") {
      params.push(`%${escapeLike(String(filter.value))}%`);
      whereClauses.push(`${quoteIdent(real)}::text ILIKE $${params.length}`);
      continue;
    }

    const op = COMPARISON_SQL[filter.operator];
    if (config.type === "numeric" || config.type === "integer") {
      if (!isNumericValue(filter.value)) {
        throw new DataQueryError(
          `Nieprawidłowa wartość liczbowa dla kolumny „${filter.column}”.`,
        );
      }
      params.push(String(filter.value));
      whereClauses.push(`${quoteIdent(real)} ${op} $${params.length}::numeric`);
    } else if (config.type === "date") {
      if (!isDateValue(filter.value)) {
        throw new DataQueryError(
          `Nieprawidłowa wartość daty dla kolumny „${filter.column}”.`,
        );
      }
      params.push(String(filter.value));
      whereClauses.push(`${quoteIdent(real)} ${op} $${params.length}::date`);
    } else {
      params.push(String(filter.value));
      whereClauses.push(`${quoteIdent(real)} ${op} $${params.length}`);
    }
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // ── ORDER BY: validated sort columns, else the PK (stable pagination) ────────
  const orderParts = (input.sort ?? []).map((s) => {
    const { real } = resolve(s.column, "sortable");
    return `${quoteIdent(real)} ${s.direction === "desc" ? "DESC" : "ASC"}`;
  });
  if (orderParts.length === 0) {
    const fallback = liveTable.primaryKey ?? displayColumns[0];
    orderParts.push(`${quoteIdent(fallback)} ASC`);
  }
  const orderSql = `ORDER BY ${orderParts.join(", ")}`;

  // ── pagination: fetch page_size + 1 to detect a further page ────────────────
  const page = input.page ?? 1;
  const pageSize = Math.min(input.page_size ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const limit = pageSize + 1;
  const offset = (page - 1) * pageSize;

  const sql = `SELECT ${selectSql} FROM ${quoteIdent(liveTable.table)} ${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`;
  const tablesUsed = [cfg.key];

  let result;
  try {
    result = await executeReadOnly(sql, { params, timeoutMs: TIMEOUT_MS });
  } catch (cause) {
    throw new DataExecutionError(
      cause instanceof Error ? cause.message : String(cause),
      { sqlExecuted: sql, tablesUsed, cause },
    );
  }

  const hasMore = result.rows.length > pageSize;
  const rows = hasMore ? result.rows.slice(0, pageSize) : result.rows;

  return {
    rows,
    hasMore,
    page,
    pageSize,
    sqlExecuted: sql,
    tablesUsed,
    rowCount: rows.length,
    executionMs: result.executionMs,
  };
}
