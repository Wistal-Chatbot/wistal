/**
 * Wire shapes + validation for the admin ERP-tables editor.
 *   - `GET /api/admin/erp-tables` → `{ tables }`
 *   - `PUT /api/admin/erp-tables` → `{ tables }` (validated by `erpModelSaveSchema`)
 *     → `{ tables, warnings }`
 *
 * Kept free of `server-only`/`db` imports (like `prompts-types.ts`) so the route
 * handler and the client editor share these. The transactional write and the
 * live-schema cross-check live server-side.
 */

import { z } from "zod";

import type { ErpTableModel } from "@/lib/erp-schema/model";

/** Real Postgres identifier: lowercase snake_case, as the ERP tables/columns use. */
const identifier = z
  .string()
  .trim()
  .min(1)
  .max(63)
  .regex(/^[a-z_][a-z0-9_]*$/, "Dozwolone: małe litery, cyfry i podkreślenia.");

const columnSchema = z.object({
  name: identifier,
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "integer", "numeric", "date"]),
  pk: z.boolean(),
  searchable: z.boolean(),
  filterable: z.boolean(),
  sortable: z.boolean(),
});

const tableSchema = z.object({
  key: identifier,
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  synonyms: z.array(z.string().trim().min(1).max(120)).max(40),
  joins: z.array(z.string().trim().min(1).max(200)).max(40),
  notes: z.string().trim().max(4000).nullable(),
  columns: z.array(columnSchema).min(1).max(100),
});

/** Validates the whole `PUT /api/admin/erp-tables` body (the full model). */
export const erpModelSaveSchema = z.object({
  tables: z.array(tableSchema).min(1).max(50),
});

export type ErpModelSavePayload = z.infer<typeof erpModelSaveSchema>;

/** GET/PUT response: the current model plus (on save) any live-schema warnings. */
export interface ErpTablesResponse {
  tables: ErpTableModel[];
  /** Non-blocking notices, e.g. a column that no longer exists in `public`. */
  warnings?: string[];
}
