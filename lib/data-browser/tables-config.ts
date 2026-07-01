/**
 * Static display + capability config for the manual data browser (Dane).
 *
 * This is the single source of truth for WHICH of the 9 read-only `public.*` ERP
 * tables the browser exposes, their Polish labels, and — per column — the SQL
 * `type` and the `searchable` / `filterable` / `sortable` capabilities the UI may
 * offer. Column names + types mirror the canonical schema (see
 * `.claude/skills/wistal-erp-chatbot/references/database-schema.md`); the Polish
 * labels/descriptions follow the mock browser (`lib/mock-data/tables.ts`).
 *
 * It is intentionally static (no DB round-trip): the flags are a product decision,
 * not something derivable from `information_schema`. At request time the schema
 * endpoint cross-checks these against the live schema so drift can't leak a stale
 * column, and the query builder re-validates every identifier before it is used.
 *
 * Capability convention:
 *   - text identifiers/names/statuses  → searchable + filterable + sortable
 *   - free-text notes (`uwagi`)        → searchable + filterable (not sortable)
 *   - numeric / integer amounts & qty  → filterable + sortable (not searchable)
 *   - dates                            → filterable + sortable (not searchable)
 */

export type ColumnType = "text" | "integer" | "numeric" | "date";

export interface DataColumnConfig {
  /** Real DB column name (must match `public.<table>`). */
  name: string;
  /** Polish label shown as the column header. */
  label: string;
  type: ColumnType;
  /** Included in the OR-ed `global_search` (text columns only). */
  searchable: boolean;
  /** May be targeted by a `filters[]` entry. */
  filterable: boolean;
  /** May be targeted by a `sort[]` entry. */
  sortable: boolean;
}

export interface DataTableConfig {
  /** Stable key = the real table name, e.g. `"kontrahenci"`. */
  key: string;
  label: string;
  description: string;
  columns: DataColumnConfig[];
}

/** text identifier/name/status/unit column — fully searchable/filterable/sortable. */
const txt = (name: string, label: string): DataColumnConfig => ({
  name,
  label,
  type: "text",
  searchable: true,
  filterable: true,
  sortable: true,
});

/** free-text notes — searchable + filterable, but not a sensible sort key. */
const note = (name: string, label: string): DataColumnConfig => ({
  name,
  label,
  type: "text",
  searchable: true,
  filterable: true,
  sortable: false,
});

/** numeric amount / quantity — filterable + sortable, not searchable. */
const num = (name: string, label: string): DataColumnConfig => ({
  name,
  label,
  type: "numeric",
  searchable: false,
  filterable: true,
  sortable: true,
});

/** integer column (e.g. `lp`) — filterable + sortable, not searchable. */
const int = (name: string, label: string): DataColumnConfig => ({
  name,
  label,
  type: "integer",
  searchable: false,
  filterable: true,
  sortable: true,
});

/** date column — filterable + sortable, not searchable. */
const date = (name: string, label: string): DataColumnConfig => ({
  name,
  label,
  type: "date",
  searchable: false,
  filterable: true,
  sortable: true,
});

export const DATA_TABLES: DataTableConfig[] = [
  {
    key: "kontrahenci",
    label: "Kontrahenci",
    description: "Klienci i dostawcy — dane rejestrowe.",
    columns: [
      txt("kod", "Kod"),
      txt("nazwa", "Nazwa"),
      txt("nip", "NIP"),
      txt("kod_pocztowy", "Kod pocztowy"),
      txt("miasto", "Miasto"),
      txt("telefon", "Telefon"),
      txt("email", "E-mail"),
      note("uwagi", "Uwagi"),
    ],
  },
  {
    key: "towary",
    label: "Towary",
    description: "Produkty i stany magazynowe.",
    columns: [
      txt("kod", "Kod"),
      txt("nazwa", "Nazwa"),
      num("ilosc_dostepna", "Ilość dostępna"),
      num("ilosc", "Ilość"),
      num("rezerwacje", "Rezerwacje"),
      num("zamowienia", "Zamówienia"),
      num("cena", "Cena"),
      num("wartosc", "Wartość"),
      num("wartosc_zakupu", "Wartość zakupu"),
      txt("jm", "JM"),
      txt("jmp", "JMP"),
    ],
  },
  {
    key: "faktury_sprzedazy",
    label: "Faktury sprzedaży",
    description: "Dokumenty sprzedaży i statusy.",
    columns: [
      txt("numer_dokumentu", "Numer dokumentu"),
      txt("status", "Status"),
      date("data_wystawienia", "Data wystawienia"),
      txt("kontrahent_kod", "Kod kontrahenta"),
      txt("kontrahent_nazwa", "Kontrahent"),
      txt("nip", "NIP"),
      num("netto", "Netto"),
      num("brutto", "Brutto"),
      txt("status_ksef", "Status KSeF"),
    ],
  },
  {
    key: "faktury_sprzedazy_pozycje",
    label: "Pozycje faktur sprzedaży",
    description: "Pozycje dokumentów sprzedaży.",
    columns: [
      txt("numer_faktury", "Numer faktury"),
      int("lp", "Lp."),
      txt("towar_kod", "Kod towaru"),
      txt("nazwa", "Nazwa"),
      num("ilosc", "Ilość"),
      num("rabat", "Rabat"),
      num("cena", "Cena"),
      num("wartosc", "Wartość"),
      num("marza", "Marża"),
    ],
  },
  {
    key: "faktury_zakupu",
    label: "Faktury zakupu",
    description: "Dokumenty zakupu od dostawców.",
    columns: [
      txt("numer_dokumentu", "Numer dokumentu"),
      txt("dokument_zrodlowy", "Dokument źródłowy"),
      txt("status", "Status"),
      date("data_wplywu", "Data wpływu"),
      date("data_zakupu", "Data zakupu"),
      txt("kontrahent_kod", "Kod kontrahenta"),
      txt("kontrahent_nazwa", "Kontrahent"),
      txt("nip", "NIP"),
      txt("miasto", "Miasto"),
      num("netto", "Netto"),
      num("brutto", "Brutto"),
    ],
  },
  {
    key: "faktury_zakupu_pozycje",
    label: "Pozycje faktur zakupu",
    description: "Pozycje dokumentów zakupu.",
    columns: [
      txt("numer_faktury", "Numer faktury"),
      int("lp", "Lp."),
      txt("towar_kod", "Kod towaru"),
      txt("nazwa", "Nazwa"),
      num("ilosc", "Ilość"),
      txt("jm", "JM"),
      num("cena", "Cena"),
      num("wartosc", "Wartość"),
    ],
  },
  {
    key: "zamowienia_dostawcy",
    label: "Zamówienia dostawcy",
    description: "Zamówienia złożone u dostawców.",
    columns: [
      txt("numer_dokumentu", "Numer dokumentu"),
      txt("status", "Status"),
      date("termin_dostawy", "Termin dostawy"),
      txt("kontrahent_kod", "Kod kontrahenta"),
      txt("kontrahent_nazwa", "Kontrahent"),
      txt("nip", "NIP"),
      txt("miasto", "Miasto"),
      txt("nadawca", "Nadawca"),
      txt("kod_nadawcy", "Kod nadawcy"),
      num("netto", "Netto"),
      num("brutto", "Brutto"),
    ],
  },
  {
    key: "zamowienia_dostawcy_pozycje",
    label: "Pozycje zamówień dostawcy",
    description: "Pozycje zamówień do dostawców.",
    columns: [
      txt("numer_zamowienia", "Numer zamówienia"),
      int("lp", "Lp."),
      txt("towar_kod", "Kod towaru"),
      txt("nazwa", "Nazwa"),
      num("ilosc", "Ilość"),
      txt("jm", "JM"),
      num("cena", "Cena"),
      num("wartosc", "Wartość"),
    ],
  },
  {
    key: "dokumenty_powiazane",
    label: "Dokumenty powiązane",
    description: "Powiązania dokument → dokument.",
    columns: [
      txt("numer_zrodlowy", "Numer źródłowy"),
      txt("typ_zrodlowy", "Typ źródłowy"),
      txt("numer_docelowy", "Numer docelowy"),
      txt("typ_docelowy", "Typ docelowy"),
      date("data", "Data"),
    ],
  },
];

/** Case-insensitive lookup of a table's config by key/name. */
export function getTableConfig(key: string): DataTableConfig | undefined {
  const lower = key.toLowerCase();
  return DATA_TABLES.find((t) => t.key.toLowerCase() === lower);
}
