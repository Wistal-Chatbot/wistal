import type { ChatMessage, ChatSession, QuickAction } from "./types";

/**
 * Mock chat sessions, messages, and quick actions for the Chatbot screen.
 * Mirrors the `sessions`, `messages`, and `quickActions` state from the
 * Claude Design prototype.
 */

const bbc003Conversation: ChatMessage[] = [
  {
    id: "m1",
    role: "bot",
    time: "12:28",
    source: { tables: "towary", rows: "1 wiersz", ms: "42 ms" },
    blocks: [
      {
        type: "text",
        parts: [
          { text: "Towar " },
          { text: "BBC003 — Blacha gorącowalcowana 5mm", bold: true },
          { text: " ma aktualnie:" },
        ],
      },
      {
        type: "list",
        bullets: [
          { label: "Ilość dostępna", rest: ": 2 326 t" },
          { label: "Ilość ogółem", rest: ": 2 580 t" },
          { label: "Rezerwacje", rest: ": 254 t" },
          { label: "Cena", rest: ": 3 420,00 PLN/t" },
          { label: "Jednostka miary", rest: ": t (tona)" },
        ],
      },
      {
        type: "text",
        parts: [
          {
            text: "Towar posiada aktywne rezerwacje — część zapasu jest zarezerwowana dla klientów.",
          },
        ],
      },
    ],
  },
  { id: "m2", role: "user", time: "12:30", text: "Kto ma największą rezerwację tego towaru?" },
  {
    id: "m3",
    role: "bot",
    time: "12:30",
    source: { tables: "dokumenty_powiazane, towary", rows: "3 wiersze", ms: "68 ms" },
    blocks: [
      {
        type: "text",
        parts: [
          { text: "Na podstawie dokumentów powiązanych, największe aktywne rezerwacje towaru " },
          { text: "BBC003", bold: true },
          { text: ":" },
        ],
      },
      {
        type: "list",
        bullets: [
          { label: "ABC Sp. z o.o.", rest: " — 128 t (rezerwacja z dnia 18.06.2024)" },
          { label: "Budownictwo Nowak", rest: " — 76 t (rezerwacja z dnia 20.06.2024)" },
          { label: "Metaltech Wrocław Sp. k.", rest: " — 50 t (rezerwacja z dnia 21.06.2024)" },
        ],
      },
      {
        type: "text",
        parts: [{ text: "Łącznie zarezerwowane: " }, { text: "254 t", bold: true }],
      },
    ],
  },
];

export const chatSessions: ChatSession[] = [
  { id: "s1", title: "Stan magazynowy BBC003", time: "Dzisiaj, 12:30", tag: "chat", messages: bbc003Conversation },
  { id: "s2", title: "Faktury klienta ABC Sp. z o.o.", time: "Dzisiaj, 10:15", tag: "chat", messages: [] },
  { id: "s3", title: "Audyt: Metaltech Wrocław", time: "Wczoraj, 15:12", tag: "akcja", messages: [] },
  { id: "s4", title: "Zamówienia dostawcy Q2 2024", time: "Wczoraj, 09:40", tag: "chat", messages: [] },
  { id: "s5", title: "Towary z aktywnymi rezerwacjami", time: "21.06.2024, 14:22", tag: "chat", messages: [] },
];

export const quickActions: QuickAction[] = [
  {
    key: "stan_magazynowy",
    name: "Stan magazynowy",
    enabled: true,
    input: null,
    prompt: "Pokaż aktualny stan magazynowy",
  },
  {
    key: "zamowienia_kontrahenta",
    name: "Zamówienia kontrahenta",
    enabled: true,
    input: { label: "Kontrahent", placeholder: "Wybierz lub wpisz…" },
  },
  {
    key: "faktury_klienta",
    name: "Faktury klienta",
    enabled: true,
    input: { label: "Klient", placeholder: "Wybierz lub wpisz…" },
  },
];

/** Builds the canned assistant reply used by the demo send() flow. */
export function buildMockReply(prompt: string, time: string, id: string): ChatMessage {
  return {
    id,
    role: "bot",
    time,
    source: { tables: "towary, dokumenty_powiazane", rows: "4 wiersze", ms: "56 ms" },
    blocks: [
      {
        type: "text",
        parts: [
          { text: "Przygotowałem zestawienie na podstawie zapytania: " },
          { text: prompt, bold: true },
        ],
      },
      {
        type: "list",
        bullets: [
          { label: "Pozycje pasujące", rest: ": 4" },
          { label: "Stan łączny", rest: ": 2 326 t" },
          { label: "Wartość", rest: ": 7 955 920 PLN" },
        ],
      },
      {
        type: "text",
        parts: [
          {
            text: "Chcesz wyeksportować wynik do CSV lub utworzyć zadanie dla zespołu handlowego?",
          },
        ],
      },
    ],
  };
}
