/**
 * Pure transforms over the ERP tables model, split out (like `prompt-cache-core.ts`)
 * so rendering, the browser derivation, and the DB→model assembly can be
 * unit-tested without a database or `server-only`.
 */

import {
  DEFAULT_ERP_MODEL,
  type ColumnType,
  type DataTableConfig,
  type ErpColumnModel,
  type ErpTableModel,
} from "./model";

/** Fixed framing at the top of the rendered schema — not per-table, not edited. */
const SCHEMA_INTRO = `# Schemat bazy ERP (schemat \`public\`, tylko do odczytu)

Klucze złączeń to kody biznesowe, nigdy wewnętrzne ID. Wszystkie kwoty są NUMERIC.`;

const SQL_TYPE: Record<ColumnType, string> = {
  text: "TEXT",
  integer: "INTEGER",
  numeric: "NUMERIC",
  date: "DATE",
};

/** Drops a single trailing period so a description reads cleanly inside `(...)`. */
function gloss(description: string): string {
  return description.replace(/\.$/, "");
}

/**
 * Renders the model to the `{{ERP_SCHEMA}}` markdown the AI prompts inject. The
 * output is byte-stable between requests (it only changes when the model does),
 * so the Anthropic prompt-cache breakpoint behaves exactly as with the old
 * hardcoded text.
 */
export function renderErpSchemaText(model: ErpTableModel[]): string {
  const blocks = model.map((table) => {
    const pkCols = table.columns.filter((c) => c.pk);
    const composite = pkCols.length > 1;

    const columnList = table.columns
      .map((c) => {
        const mark = !composite && c.pk ? " (PK)" : "";
        return `${c.name} ${SQL_TYPE[c.type]}${mark}`;
      })
      .join(", ");

    const lines = [`## ${table.key}  (${gloss(table.description)})`, `- ${columnList}`];
    if (composite) {
      lines.push(`- Klucz główny: ${pkCols.map((c) => c.name).join(" + ")}`);
    }
    if (table.joins.length > 0) {
      lines.push(`- Złączenia: ${table.joins.join("; ")}`);
    }
    if (table.synonyms.length > 0) {
      lines.push(`- Synonimy: ${table.synonyms.join(", ")}.`);
    }
    if (table.notes && table.notes.trim().length > 0) {
      lines.push(`- ${table.notes.trim()}`);
    }
    return lines.join("\n");
  });

  return `${SCHEMA_INTRO}\n\n${blocks.join("\n\n")}`;
}

/** Derives the Dane browser config (drops the AI-only synonyms/joins/notes/pk). */
export function toDataTables(model: ErpTableModel[]): DataTableConfig[] {
  return model.map((table) => ({
    key: table.key,
    label: table.label,
    description: table.description,
    columns: table.columns.map((c) => ({
      name: c.name,
      label: c.label,
      type: c.type,
      searchable: c.searchable,
      filterable: c.filterable,
      sortable: c.sortable,
    })),
  }));
}

/** Row shapes as read from the DB (kept structural so this stays DB-free). */
export interface ErpTableRowLike {
  key: string;
  label: string;
  description: string;
  synonyms: string[];
  joins: string[];
  notes: string | null;
  position: number;
}
export interface ErpColumnRowLike {
  tableKey: string;
  name: string;
  label: string;
  type: string;
  pk: boolean;
  searchable: boolean;
  filterable: boolean;
  sortable: boolean;
  position: number;
}

function isColumnType(value: string): value is ColumnType {
  return value === "text" || value === "integer" || value === "numeric" || value === "date";
}

/**
 * Assembles the model from DB rows, falling back to `DEFAULT_ERP_MODEL` when the
 * tables are empty (unseeded / a failed read) — so every caller always gets a
 * usable model rather than an empty schema (parallels `resolvePromptMap`).
 */
export function resolveErpModel(
  tableRows: ReadonlyArray<ErpTableRowLike>,
  columnRows: ReadonlyArray<ErpColumnRowLike>,
): ErpTableModel[] {
  if (tableRows.length === 0) return DEFAULT_ERP_MODEL;

  const columnsByTable = new Map<string, ErpColumnRowLike[]>();
  for (const col of columnRows) {
    const arr = columnsByTable.get(col.tableKey) ?? [];
    arr.push(col);
    columnsByTable.set(col.tableKey, arr);
  }

  return [...tableRows]
    .sort((a, b) => a.position - b.position)
    .map((table) => {
      const columns: ErpColumnModel[] = (columnsByTable.get(table.key) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((c) => ({
          name: c.name,
          label: c.label,
          // A malformed stored type degrades to `text` rather than breaking rendering.
          type: isColumnType(c.type) ? c.type : "text",
          pk: c.pk,
          searchable: c.searchable,
          filterable: c.filterable,
          sortable: c.sortable,
        }));

      return {
        key: table.key,
        label: table.label,
        description: table.description,
        synonyms: table.synonyms,
        joins: table.joins,
        notes: table.notes,
        columns,
      };
    });
}
