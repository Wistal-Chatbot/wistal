import type { AiReport, AuditReport, ReportRun } from "./types";

/**
 * Mock AI reports, recent runs, and the rendered audit-report widget data.
 * Mirrors the `aiReports` state and the "Raport AI — wynik" view from the
 * Claude Design prototype.
 */

export const aiReports: AiReport[] = [
  {
    id: "audyt",
    name: "Audyt klienta",
    desc: "Kompleksowa ocena: historia płatności, faktury, limity kupieckie.",
    active: true,
    tables: "kontrahenci, faktury_sprzedazy",
  },
  {
    id: "rotacja",
    name: "Analiza rotacji zapasów",
    desc: "Pozycje zalegające i rekomendacje uzupełnień magazynu.",
    active: true,
    tables: "towary, zamowienia_dostawcy",
  },
  {
    id: "naleznosci",
    name: "Przeterminowane należności",
    desc: "Faktury po terminie wraz z oceną ryzyka windykacji.",
    active: true,
    tables: "faktury_sprzedazy, kontrahenci",
  },
  {
    id: "marza",
    name: "Marża na kontrahencie",
    desc: "Rentowność sprzedaży w rozbiciu na pozycje i okresy.",
    active: false,
    tables: "faktury_sprzedazy_pozycje",
  },
];

export const recentRuns: ReportRun[] = [
  { reportId: "audyt", title: "Audyt klienta — Stalexpol", date: "23.06 · 09:41", user: "J. Kowalski", status: "Zakończone" },
  { reportId: "rotacja", title: "Analiza rotacji zapasów", date: "23.06 · 09:14", user: "A. Nowak", status: "Zakończone" },
  { reportId: "naleznosci", title: "Przeterminowane należności", date: "22.06 · 16:30", user: "E. Lis", status: "W toku" },
];

/** The rendered audit widget shown on the report result screen. */
export const auditReport: AuditReport = {
  reportId: "audyt",
  score: 72,
  scoreMax: 100,
  scorePct: 72,
  eyebrow: "RAPORT AUDYTU · 23.06.2026",
  company: "Stalexpol Sp. z o.o.",
  meta: "NIP 884‑25‑65‑480 · Konstrukcje stalowe · Dolnośląskie",
  riskLabel: "Ryzyko umiarkowane",
  riskTone: "warn",
  riskBars: [
    { label: "Wiarygodność płatnicza", valueLabel: "Dobra", tone: "good", pct: 78 },
    { label: "Stabilność finansowa", valueLabel: "Średnia", tone: "warn", pct: 64 },
    { label: "Poziom zadłużenia", valueLabel: "Umiarkowany", tone: "warn", pct: 55 },
    { label: "Historia współpracy", valueLabel: "Bardzo dobra", tone: "good", pct: 88 },
  ],
  financials: [
    { year: "2023", revenue: "14,2 mln zł", profit: "+0,9 mln", profitTone: "good" },
    { year: "2024", revenue: "16,8 mln zł", profit: "+1,3 mln", profitTone: "good" },
    { year: "2025", revenue: "15,1 mln zł", profit: "−0,2 mln", profitTone: "bad" },
  ],
  financialsSource: "Źródło: KRS, sprawozdania finansowe, rejestry BIG.",
  recommendation: [
    { text: "Współpraca rekomendowana z " },
    { text: "limitem kupieckim 180 000 zł", bold: true },
    { text: " (zamiast wnioskowanych 250 000 zł) oraz terminem płatności " },
    { text: "21 dni", bold: true },
    {
      text: ". Klient wykazuje stabilną historię zamówień i dobrą dyscyplinę płatniczą, jednak spadek wyniku w 2025 r. uzasadnia ostrożniejszy limit na pierwsze 6 miesięcy. Sugerowane zabezpieczenie: ubezpieczenie należności do 70%.",
    },
  ],
  genTime: "2,3 s",
  tables: "kontrahenci, faktury_sprzedazy",
};
