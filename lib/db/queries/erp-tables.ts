import "server-only";

import { asc } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import {
  erpColumns,
  erpTables,
  type ErpColumnRow,
  type ErpTableRow,
} from "@/lib/db/schema";
import type { ErpTableModel } from "@/lib/erp-schema/model";

/** All ERP table + column rows, ordered by `position` (assembled in the core). */
export async function getErpModelRows(): Promise<{
  tables: ErpTableRow[];
  columns: ErpColumnRow[];
}> {
  const [tables, columns] = await Promise.all([
    db.select().from(erpTables).orderBy(asc(erpTables.position), asc(erpTables.key)),
    db
      .select()
      .from(erpColumns)
      .orderBy(asc(erpColumns.position), asc(erpColumns.id)),
  ]);
  return { tables, columns };
}

/**
 * Replaces the whole model in one transaction: the admin editor always sends the
 * complete set, so a delete-all + insert-all is the simplest correct write (the
 * table is unversioned, so nothing is lost). Deleting `erp_tables` cascades to
 * `erp_columns`; we clear columns first anyway to be explicit. `position` is the
 * array index, preserving the editor's ordering.
 */
export async function replaceErpModel(model: ErpTableModel[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(erpColumns);
    await tx.delete(erpTables);

    for (let ti = 0; ti < model.length; ti++) {
      const table = model[ti];
      await tx.insert(erpTables).values({
        key: table.key,
        label: table.label,
        description: table.description,
        synonyms: table.synonyms,
        joins: table.joins,
        notes: table.notes ?? null,
        position: ti,
      });

      if (table.columns.length > 0) {
        await tx.insert(erpColumns).values(
          table.columns.map((col, ci) => ({
            tableKey: table.key,
            name: col.name,
            label: col.label,
            type: col.type,
            pk: col.pk,
            searchable: col.searchable,
            filterable: col.filterable,
            sortable: col.sortable,
            position: ci,
          })),
        );
      }
    }
  });
}
