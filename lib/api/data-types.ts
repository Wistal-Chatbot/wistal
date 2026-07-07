/**
 * Wire shapes + request validation for the manual data browser (Dane) endpoints:
 *   - `GET  /api/data/schema` → `DataSchemaResponse`
 *   - `POST /api/data/query`  → `DataQueryRequest` → `DataQueryResponse`
 *
 * Kept free of `server-only`/db imports (like `quick-actions-types.ts`) so the
 * route handlers and the eventual client can share these types. The identifier
 * validation and SQL building live server-only in `lib/data-browser/query.ts`.
 */

import { z } from "zod";

import type { ColumnType } from "@/lib/data-browser/tables-config";

/** Comparison operators a single filter may use. */
export const FILTER_OPERATORS = [
  "eq",
  "gt",
  "lt",
  "gte",
  "lte",
  "like",
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** Pagination bounds — mirror these in the UI so requests don't get rejected. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

const filterSchema = z.object({
  column: z.string().min(1),
  operator: z.enum(FILTER_OPERATORS),
  // String or number; equality/`like` on text uses the string, numeric/date
  // comparisons are bound as-is and cast by Postgres against the real column.
  value: z.union([z.string(), z.number()]),
});

const sortSchema = z.object({
  column: z.string().min(1),
  direction: z.enum(["asc", "desc"]),
});

/** Validates the `POST /api/data/query` body. */
export const dataQueryRequestSchema = z.object({
  table: z.string().min(1),
  global_search: z.string().trim().max(200).optional(),
  filters: z.array(filterSchema).max(20).optional(),
  sort: z.array(sortSchema).max(5).optional(),
  page: z.number().int().min(1).optional(),
  page_size: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export type DataFilter = z.infer<typeof filterSchema>;
export type DataSort = z.infer<typeof sortSchema>;
export type DataQueryRequest = z.infer<typeof dataQueryRequestSchema>;

export interface DataQueryResponse {
  rows: Record<string, unknown>[];
  /** True when a further page exists (we fetch `page_size + 1` to detect it). */
  has_more: boolean;
  page: number;
  page_size: number;
}

// ── GET /api/data/schema ──────────────────────────────────────────────────

export interface DataSchemaColumn {
  name: string;
  label: string;
  type: ColumnType;
  searchable: boolean;
  filterable: boolean;
  sortable: boolean;
}

export interface DataSchemaTable {
  key: string;
  label: string;
  description: string;
  /** Single-column primary key from live introspection, or `null` (composite). */
  primaryKey: string | null;
  columns: DataSchemaColumn[];
}

export interface DataSchemaResponse {
  tables: DataSchemaTable[];
}
