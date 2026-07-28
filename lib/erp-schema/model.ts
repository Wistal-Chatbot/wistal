/**
 * The single source of truth for the ERP tables model — the shape stored in
 * `chatbot.erp_tables` / `chatbot.erp_columns` and edited from the admin
 * "Schemat bazy" screen.
 *
 * One model now feeds BOTH surfaces that used to keep their own copy of the 9
 * read-only `public.*` ERP tables:
 *   - the AI system prompt (`{{ERP_SCHEMA}}`), via `renderErpSchemaText`;
 *   - the manual Dane browser, via `toDataTables` (both in `erp-schema-core.ts`).
 *
 * `DEFAULT_ERP_MODEL` below merges what those two files used to hold separately:
 * capability flags + Polish labels (from the old `data-browser/tables-config.ts`)
 * and synonyms / join keys / notes / PK marks (from the old `ai/erp-schema.ts`).
 * It is the migration seed AND the runtime fallback if Neon is unavailable, so
 * chat, reports, and the browser keep working off it when the DB is unreachable.
 *
 * Intentionally free of `server-only` and `db` imports (like `prompt-defaults.ts`)
 * so the admin client and `lib/api/*` can import the types + default without
 * pulling the server bundle in.
 */

export type ColumnType = "text" | "integer" | "numeric" | "date";

/** Browser-facing column shape consumed by the Dane data browser. */
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

/** Browser-facing table shape consumed by the Dane data browser. */
export interface DataTableConfig {
  /** Stable key = the real table name, e.g. `"kontrahenci"`. */
  key: string;
  label: string;
  description: string;
  columns: DataColumnConfig[];
}

/** Full column model: the browser fields plus whether it is (part of) the PK. */
export interface ErpColumnModel extends DataColumnConfig {
  /** Part of the primary key — rendered as `(PK)` / `Klucz główny` in the schema text. */
  pk: boolean;
}

/** Full table model: the browser fields plus the AI-only schema context. */
export interface ErpTableModel {
  key: string;
  label: string;
  description: string;
  /** Business synonyms for the AI (e.g. `klient`, `FA`). Browser ignores these. */
  synonyms: string[];
  /** Join hints for the AI, e.g. `kontrahent_kod -> kontrahenci.kod`. */
  joins: string[];
  /** Free-form markdown appended after the columns in the schema text. */
  notes: string | null;
  columns: ErpColumnModel[];
}

// ── Column builders (mirror the old tables-config helpers + a PK flag) ────────

/** text identifier/name/status/unit column — fully searchable/filterable/sortable. */
const txt = (name: string, label: string, pk = false): ErpColumnModel => ({
  name,
  label,
  type: "text",
  pk,
  searchable: true,
  filterable: true,
  sortable: true,
});

/** free-text notes — searchable + filterable, but not a sensible sort key. */
const note = (name: string, label: string): ErpColumnModel => ({
  name,
  label,
  type: "text",
  pk: false,
  searchable: true,
  filterable: true,
  sortable: false,
});

/** numeric amount / quantity — filterable + sortable, not searchable. */
const num = (name: string, label: string): ErpColumnModel => ({
  name,
  label,
  type: "numeric",
  pk: false,
  searchable: false,
  filterable: true,
  sortable: true,
});

/** integer column (e.g. `lp`) — filterable + sortable, not searchable. */
const int = (name: string, label: string, pk = false): ErpColumnModel => ({
  name,
  label,
  type: "integer",
  pk,
  searchable: false,
  filterable: true,
  sortable: true,
});

/** date column — filterable + sortable, not searchable. */
const date = (name: string, label: string): ErpColumnModel => ({
  name,
  label,
  type: "date",
  pk: false,
  searchable: false,
  filterable: true,
  sortable: true,
});

export const DEFAULT_ERP_MODEL: ErpTableModel[] = [
  {
    key: "kontrahenci",
    label: "Kontrahenci",
    description: "Klienci i dostawcy — dane rejestrowe.",
    synonyms: ["klient", "kontrahent", "dostawca", "firma"],
    joins: [],
    notes: null,
    columns: [
      txt("kod", "Kod", true),
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
    synonyms: [
      "towar",
      "produkt",
      "asortyment",
      "materiał",
      "stan magazynowy (= ilosc_dostepna)",
    ],
    joins: [],
    notes: null,
    columns: [
      txt("kod", "Kod", true),
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
    synonyms: ["faktura", "FA", "sprzedaż"],
    joins: ["kontrahent_kod -> kontrahenci.kod"],
    notes: null,
    columns: [
      txt("numer_dokumentu", "Numer dokumentu", true),
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
    synonyms: [],
    joins: [
      "numer_faktury -> faktury_sprzedazy.numer_dokumentu",
      "towar_kod -> towary.kod",
    ],
    notes: null,
    columns: [
      txt("numer_faktury", "Numer faktury", true),
      int("lp", "Lp.", true),
      txt("towar_kod", "Kod towaru", true),
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
    synonyms: ["faktura zakupu", "FZ", "zakup"],
    joins: ["kontrahent_kod -> kontrahenci.kod"],
    notes: null,
    columns: [
      txt("numer_dokumentu", "Numer dokumentu", true),
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
    synonyms: [],
    joins: [
      "numer_faktury -> faktury_zakupu.numer_dokumentu",
      "towar_kod -> towary.kod",
    ],
    notes: null,
    columns: [
      txt("numer_faktury", "Numer faktury", true),
      int("lp", "Lp.", true),
      txt("towar_kod", "Kod towaru", true),
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
    synonyms: ["zamówienie", "ZD", "zamówienie do dostawcy"],
    joins: ["kontrahent_kod, kod_nadawcy -> kontrahenci.kod"],
    notes: null,
    columns: [
      txt("numer_dokumentu", "Numer dokumentu", true),
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
    synonyms: [],
    joins: [
      "numer_zamowienia -> zamowienia_dostawcy.numer_dokumentu",
      "towar_kod -> towary.kod",
    ],
    notes: null,
    columns: [
      txt("numer_zamowienia", "Numer zamówienia", true),
      int("lp", "Lp.", true),
      txt("towar_kod", "Kod towaru", true),
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
    synonyms: [],
    joins: [],
    notes:
      "Łączy dokumenty na poziomie nagłówków (np. WZ -> FA). Jeden dokument docelowy może mieć wiele źródłowych (np. 3 WZ składają się na 1 FA = trzy wiersze z tym samym numer_docelowy). Brak powiązań na poziomie pojedynczych pozycji.",
    columns: [
      txt("numer_zrodlowy", "Numer źródłowy", true),
      txt("typ_zrodlowy", "Typ źródłowy"),
      txt("numer_docelowy", "Numer docelowy", true),
      txt("typ_docelowy", "Typ docelowy"),
      date("data", "Data"),
    ],
  },
];
