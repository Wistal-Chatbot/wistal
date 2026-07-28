import assert from "node:assert/strict";
import test from "node:test";

import {
  renderErpSchemaText,
  resolveErpModel,
  toDataTables,
  type ErpColumnRowLike,
  type ErpTableRowLike,
} from "../lib/erp-schema/erp-schema-core";
import { DEFAULT_ERP_MODEL } from "../lib/erp-schema/model";

test("resolveErpModel falls back to the default when no rows exist", () => {
  assert.deepEqual(resolveErpModel([], []), DEFAULT_ERP_MODEL);
  // A stray column with no matching table must not conjure a table.
  assert.deepEqual(
    resolveErpModel([], [
      {
        tableKey: "ghost",
        name: "x",
        label: "X",
        type: "text",
        pk: false,
        searchable: true,
        filterable: true,
        sortable: true,
        position: 0,
      },
    ]),
    DEFAULT_ERP_MODEL,
  );
});

test("resolveErpModel assembles rows, ordered by position, degrading a bad type", () => {
  const tableRows: ErpTableRowLike[] = [
    {
      key: "towary",
      label: "Towary",
      description: "Produkty.",
      synonyms: ["towar"],
      joins: [],
      notes: null,
      position: 1,
    },
    {
      key: "kontrahenci",
      label: "Kontrahenci",
      description: "Klienci.",
      synonyms: [],
      joins: [],
      notes: null,
      position: 0,
    },
  ];
  const columnRows: ErpColumnRowLike[] = [
    {
      tableKey: "kontrahenci",
      name: "kod",
      label: "Kod",
      type: "text",
      pk: true,
      searchable: true,
      filterable: true,
      sortable: true,
      position: 0,
    },
    {
      tableKey: "towary",
      name: "cena",
      label: "Cena",
      type: "weird", // malformed → degrades to text
      pk: false,
      searchable: false,
      filterable: true,
      sortable: true,
      position: 0,
    },
  ];

  const model = resolveErpModel(tableRows, columnRows);
  assert.deepEqual(
    model.map((t) => t.key),
    ["kontrahenci", "towary"],
  );
  assert.equal(model[0].columns[0].pk, true);
  assert.equal(model[1].columns[0].type, "text");
});

test("toDataTables mirrors the 9 tables and drops the AI-only fields", () => {
  const dataTables = toDataTables(DEFAULT_ERP_MODEL);
  assert.equal(dataTables.length, DEFAULT_ERP_MODEL.length);
  assert.deepEqual(
    dataTables.map((t) => t.key),
    DEFAULT_ERP_MODEL.map((t) => t.key),
  );

  const kontrahenci = dataTables.find((t) => t.key === "kontrahenci")!;
  const uwagi = kontrahenci.columns.find((c) => c.name === "uwagi")!;
  // The browser shape carries no `pk` field, and the capability flags survive.
  assert.ok(!("pk" in uwagi));
  assert.deepEqual(
    { searchable: uwagi.searchable, filterable: uwagi.filterable, sortable: uwagi.sortable },
    { searchable: true, filterable: true, sortable: false },
  );

  const towary = dataTables.find((t) => t.key === "towary")!;
  const cena = towary.columns.find((c) => c.name === "cena")!;
  assert.equal(cena.searchable, false); // numeric → not searchable
});

test("renderErpSchemaText carries every table, type, join, synonym and note", () => {
  const text = renderErpSchemaText(DEFAULT_ERP_MODEL);

  assert.ok(text.startsWith("# Schemat bazy ERP"));
  // Header + a single-PK inline mark.
  assert.ok(text.includes("## kontrahenci  (Klienci i dostawcy — dane rejestrowe)"));
  assert.ok(text.includes("kod TEXT (PK)"));
  // Synonyms and joins.
  assert.ok(text.includes("Synonimy: klient, kontrahent, dostawca, firma."));
  assert.ok(text.includes("Złączenia: kontrahent_kod -> kontrahenci.kod"));
  // Table-level notes.
  assert.ok(text.includes("Brak powiązań na poziomie pojedynczych pozycji."));
});

test("renderErpSchemaText renders a composite PK as a line, not inline", () => {
  const text = renderErpSchemaText(DEFAULT_ERP_MODEL);
  assert.ok(text.includes("Klucz główny: numer_faktury + lp + towar_kod"));
  // The composite key columns must NOT also carry an inline (PK) mark.
  assert.ok(!text.includes("numer_faktury TEXT (PK)"));
});
