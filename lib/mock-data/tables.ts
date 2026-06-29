import type { TableColumn, TableDef, TableRecord } from "./types";

/**
 * ERP tables for the manual data browser (Dane). Mirrors `tableDefs()` from the
 * Claude Design prototype. All values are pre-formatted for display: numeric
 * amounts use the Polish convention (space thousands separator, comma decimal).
 */

const plNumber = new Intl.NumberFormat("pl-PL");
const plMoney = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmt = (n: number) => plNumber.format(n);
const money = (n: number) => plMoney.format(n);

const col = (
  key: string,
  label: string,
  opts: Omit<TableColumn, "key" | "label"> = {},
): TableColumn => ({ key, label, ...opts });

// Raw warehouse stock — Towary display rows are derived from this so amounts and
// the computed "wartość" column stay consistent.
interface TowarRaw {
  kod: string;
  nazwa: string;
  ilosc_dostepna: number;
  ilosc: number;
  rezerwacje: number;
  cena: number;
  jm: string;
  jmp: string;
}

const towaryRaw: TowarRaw[] = [
  { kod: "BBC003", nazwa: "Blacha gorącowalcowana 2000×1000×3 S235JR", ilosc_dostepna: 2326, ilosc: 2580, rezerwacje: 254, cena: 3420, jm: "t", jmp: "ar" },
  { kod: "BBC004", nazwa: "Blacha gorącowalcowana 2000×1000×4 S235JR", ilosc_dostepna: 1840, ilosc: 1980, rezerwacje: 140, cena: 3380, jm: "t", jmp: "ar" },
  { kod: "BBC005", nazwa: "Blacha gorącowalcowana 2000×1000×5 S235JR", ilosc_dostepna: 3120, ilosc: 3120, rezerwacje: 0, cena: 3350, jm: "t", jmp: "ar" },
  { kod: "BBG002", nazwa: "Blacha gorącowalcowana 2500×1250×2 S235JR", ilosc_dostepna: 980, ilosc: 1240, rezerwacje: 260, cena: 3510, jm: "t", jmp: "ar" },
  { kod: "BBZ010", nazwa: "Blacha zimnowalcowana 2500×1250×1 DC01", ilosc_dostepna: 1450, ilosc: 1610, rezerwacje: 160, cena: 4180, jm: "t", jmp: "ar" },
  { kod: "BBO015", nazwa: "Blacha ocynkowana 2000×1000×1,5 DX51D", ilosc_dostepna: 0, ilosc: 220, rezerwacje: 220, cena: 4920, jm: "t", jmp: "ar" },
  { kod: "PRO040", nazwa: "Pręt okrągły ⌀40 S355J2", ilosc_dostepna: 5100, ilosc: 5400, rezerwacje: 300, cena: 3680, jm: "t", jmp: "m" },
  { kod: "PRZ016", nazwa: "Pręt żebrowany ⌀16 B500SP", ilosc_dostepna: 8200, ilosc: 8200, rezerwacje: 0, cena: 2940, jm: "t", jmp: "m" },
  { kod: "RUO076", nazwa: "Rura okrągła ⌀76,1×3,2 S235JR", ilosc_dostepna: 1620, ilosc: 1780, rezerwacje: 160, cena: 4350, jm: "t", jmp: "m" },
  { kod: "RUK040", nazwa: "Rura kwadratowa 40×40×3 S235JR", ilosc_dostepna: 2240, ilosc: 2240, rezerwacje: 0, cena: 4190, jm: "t", jmp: "m" },
  { kod: "PRF200", nazwa: "Profil HEB 200 S355JR", ilosc_dostepna: 760, ilosc: 980, rezerwacje: 220, cena: 4010, jm: "t", jmp: "m" },
  { kod: "KAT050", nazwa: "Kątownik równoramienny L50×50×5 S235JR", ilosc_dostepna: 1380, ilosc: 1380, rezerwacje: 0, cena: 3290, jm: "t", jmp: "m" },
];

const towaryRows: TableRecord[] = towaryRaw.map((r) => ({
  kod: r.kod,
  nazwa: r.nazwa,
  ilosc_dostepna: fmt(r.ilosc_dostepna),
  ilosc: fmt(r.ilosc),
  rezerwacje: fmt(r.rezerwacje),
  cena: `${money(r.cena)} zł`,
  wartosc: `${money(r.ilosc * r.cena)} zł`,
  jm: r.jm,
  jmp: r.jmp,
}));

export const erpTables: TableDef[] = [
  {
    key: "kontrahenci",
    label: "Kontrahenci",
    desc: "Klienci i dostawcy — dane rejestrowe.",
    columns: [
      col("kod", "KOD", { mono: true }),
      col("nazwa", "NAZWA"),
      col("nip", "NIP", { mono: true }),
      col("miasto", "MIASTO"),
      col("telefon", "TELEFON", { mono: true }),
      col("email", "EMAIL", { mono: true }),
    ],
    rows: [
      { kod: "STALEXPOL", nazwa: "Stalexpol Sp. z o.o.", nip: "884-25-65-480", miasto: "Świdnica", telefon: "+48 74 850 12 00", email: "biuro@stalexpol.pl" },
      { kod: "ABC", nazwa: "ABC Sp. z o.o.", nip: "894-11-22-333", miasto: "Wrocław", telefon: "+48 71 320 44 10", email: "kontakt@abc.com.pl" },
      { kod: "METALTECH", nazwa: "Metaltech Wrocław Sp. k.", nip: "897-18-90-456", miasto: "Wrocław", telefon: "+48 71 700 88 22", email: "biuro@metaltech.pl" },
      { kod: "BUDNOWAK", nazwa: "Budownictwo Nowak", nip: "611-02-77-981", miasto: "Legnica", telefon: "+48 76 222 33 44", email: "nowak@budnowak.pl" },
    ],
  },
  {
    key: "towary",
    label: "Towary",
    desc: "Produkty i stany magazynowe.",
    columns: [
      col("kod", "KOD", { mono: true }),
      col("nazwa", "NAZWA"),
      col("ilosc_dostepna", "ILOŚĆ DOSTĘPNA", { align: "right", mono: true }),
      col("ilosc", "ILOŚĆ", { align: "right", mono: true }),
      col("rezerwacje", "REZERWACJE", { align: "right", mono: true }),
      col("cena", "CENA", { align: "right", mono: true }),
      col("wartosc", "WARTOŚĆ", { align: "right", mono: true }),
      col("jm", "JM"),
      col("jmp", "JMP"),
    ],
    rows: towaryRows,
  },
  {
    key: "faktury_sprzedazy",
    label: "Faktury sprzedaży",
    desc: "Dokumenty sprzedaży i statusy.",
    columns: [
      col("numer", "NUMER", { mono: true }),
      col("kontrahent", "KONTRAHENT"),
      col("data", "DATA", { mono: true }),
      col("netto", "NETTO", { align: "right", mono: true }),
      col("brutto", "BRUTTO", { align: "right", mono: true }),
      col("status", "STATUS", { badge: true }),
      col("ksef", "KSEF", { mono: true }),
    ],
    rows: [
      { numer: "FS/2026/0612", kontrahent: "ABC Sp. z o.o.", data: "18.06.2026", netto: "128 400,00", brutto: "157 932,00", status: "Zapłacona", ksef: "Wysłana" },
      { numer: "FS/2026/0598", kontrahent: "Stalexpol Sp. z o.o.", data: "14.06.2026", netto: "86 200,00", brutto: "106 026,00", status: "Wystawiona", ksef: "Wysłana" },
      { numer: "FS/2026/0571", kontrahent: "Metaltech Wrocław", data: "09.06.2026", netto: "42 750,00", brutto: "52 582,50", status: "Przeterminowana", ksef: "Oczekuje" },
    ],
  },
  {
    key: "pozycje_faktur_sprzedazy",
    label: "Pozycje faktur sprzedaży",
    desc: "Pozycje dokumentów sprzedaży.",
    columns: [
      col("numer", "FAKTURA", { mono: true }),
      col("lp", "LP", { mono: true }),
      col("towar", "TOWAR", { mono: true }),
      col("nazwa", "NAZWA"),
      col("ilosc", "ILOŚĆ", { align: "right", mono: true }),
      col("cena", "CENA", { align: "right", mono: true }),
      col("wartosc", "WARTOŚĆ", { align: "right", mono: true }),
      col("marza", "MARŻA", { align: "right", mono: true }),
    ],
    rows: [
      { numer: "FS/2026/0612", lp: "1", towar: "BBC003", nazwa: "Blacha gorącowalcowana 5mm", ilosc: "24 t", cena: "3 420,00", wartosc: "82 080,00", marza: "11,2%" },
      { numer: "FS/2026/0612", lp: "2", towar: "PR-040-S355", nazwa: "Pręt okrągły S355J2", ilosc: "9 t", cena: "5 100,00", wartosc: "45 900,00", marza: "9,4%" },
    ],
  },
  {
    key: "faktury_zakupu",
    label: "Faktury zakupu",
    desc: "Dokumenty zakupu od dostawców.",
    columns: [
      col("numer", "NUMER", { mono: true }),
      col("kontrahent", "DOSTAWCA"),
      col("data", "DATA ZAKUPU", { mono: true }),
      col("netto", "NETTO", { align: "right", mono: true }),
      col("brutto", "BRUTTO", { align: "right", mono: true }),
      col("status", "STATUS", { badge: true }),
    ],
    rows: [
      { numer: "FZ/2026/0241", kontrahent: "ArcelorMittal", data: "10.06.2026", netto: "312 000,00", brutto: "383 760,00", status: "Zapłacona" },
      { numer: "FZ/2026/0228", kontrahent: "CMC Poland", data: "04.06.2026", netto: "154 300,00", brutto: "189 789,00", status: "Wystawiona" },
    ],
  },
  {
    key: "pozycje_faktur_zakupu",
    label: "Pozycje faktur zakupu",
    desc: "Pozycje dokumentów zakupu.",
    columns: [
      col("numer", "FAKTURA", { mono: true }),
      col("lp", "LP", { mono: true }),
      col("towar", "TOWAR", { mono: true }),
      col("nazwa", "NAZWA"),
      col("ilosc", "ILOŚĆ", { align: "right", mono: true }),
      col("jm", "JM"),
      col("cena", "CENA", { align: "right", mono: true }),
      col("wartosc", "WARTOŚĆ", { align: "right", mono: true }),
    ],
    rows: [
      { numer: "FZ/2026/0241", lp: "1", towar: "BBC003", nazwa: "Blacha gorącowalcowana 5mm", ilosc: "80", jm: "t", cena: "3 050,00", wartosc: "244 000,00" },
      { numer: "FZ/2026/0241", lp: "2", towar: "BL-1000-DC01", nazwa: "Blacha zimnowalcowana DC01", ilosc: "22", jm: "t", cena: "3 090,00", wartosc: "67 980,00" },
    ],
  },
  {
    key: "zamowienia_dostawcy",
    label: "Zamówienia dostawcy",
    desc: "Zamówienia złożone u dostawców.",
    columns: [
      col("numer", "NUMER", { mono: true }),
      col("kontrahent", "DOSTAWCA"),
      col("termin", "TERMIN DOSTAWY", { mono: true }),
      col("netto", "NETTO", { align: "right", mono: true }),
      col("brutto", "BRUTTO", { align: "right", mono: true }),
      col("status", "STATUS", { badge: true }),
    ],
    rows: [
      { numer: "ZD/2026/0118", kontrahent: "ArcelorMittal", termin: "30.06.2026", netto: "420 000,00", brutto: "516 600,00", status: "W realizacji" },
      { numer: "ZD/2026/0112", kontrahent: "CMC Poland", termin: "24.06.2026", netto: "138 000,00", brutto: "169 740,00", status: "Zrealizowane" },
    ],
  },
  {
    key: "pozycje_zamowien_dostawcy",
    label: "Pozycje zamówień dostawcy",
    desc: "Pozycje zamówień do dostawców.",
    columns: [
      col("numer", "ZAMÓWIENIE", { mono: true }),
      col("lp", "LP", { mono: true }),
      col("towar", "TOWAR", { mono: true }),
      col("nazwa", "NAZWA"),
      col("ilosc", "ILOŚĆ", { align: "right", mono: true }),
      col("jm", "JM"),
      col("cena", "CENA", { align: "right", mono: true }),
      col("wartosc", "WARTOŚĆ", { align: "right", mono: true }),
    ],
    rows: [
      { numer: "ZD/2026/0118", lp: "1", towar: "BBC003", nazwa: "Blacha gorącowalcowana 5mm", ilosc: "120", jm: "t", cena: "3 050,00", wartosc: "366 000,00" },
      { numer: "ZD/2026/0118", lp: "2", towar: "PF-HEB200", nazwa: "Profil HEB 200", ilosc: "18", jm: "t", cena: "3 000,00", wartosc: "54 000,00" },
    ],
  },
  {
    key: "dokumenty_powiazane",
    label: "Dokumenty powiązane",
    desc: "Powiązania dokument → dokument.",
    columns: [
      col("zrodlo", "NR ŹRÓDŁOWY", { mono: true }),
      col("typz", "TYP ŹRÓDŁA"),
      col("cel", "NR DOCELOWY", { mono: true }),
      col("typc", "TYP DOCELOWY"),
      col("data", "DATA", { mono: true }),
    ],
    rows: [
      { zrodlo: "ZD/2026/0118", typz: "Zamówienie", cel: "FZ/2026/0241", typc: "Faktura zakupu", data: "10.06.2026" },
      { zrodlo: "FS/2026/0612", typz: "Faktura sprzedaży", cel: "WZ/2026/0431", typc: "Wydanie zewn.", data: "18.06.2026" },
    ],
  },
];

export const erpTablesByKey: Record<string, TableDef> = Object.fromEntries(
  erpTables.map((t) => [t.key, t]),
);

/** Status pill colors used across grid badges. [background, text]. */
export const statusBadgeColors: Record<string, [string, string]> = {
  Dostępny: ["#e6f2ec", "#1f6b4a"],
  Zapłacona: ["#e6f2ec", "#1f6b4a"],
  Zrealizowane: ["#e6f2ec", "#1f6b4a"],
  "Niski stan": ["#fbf0dd", "#9a6a18"],
  Wystawiona: ["#e7eef6", "#1E2188"],
  "W realizacji": ["#fbf0dd", "#9a6a18"],
  Zamówiony: ["#e7eef6", "#1E2188"],
  Przeterminowana: ["#f7e7e4", "#b4402e"],
  Brak: ["#f7e7e4", "#b4402e"],
};

export function badgeColorsFor(status: string): [string, string] {
  return statusBadgeColors[status] ?? ["#eef1f5", "#58616e"];
}
