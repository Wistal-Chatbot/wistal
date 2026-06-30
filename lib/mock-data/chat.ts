import type { QuickAction } from "./types";

/**
 * Szybkie akcje (quick actions) for the chat composer and the admin management
 * panel. Still mock until the `/api/quick-actions` backend lands — shared by
 * `app/app/chat/ChatView.tsx` and `app/app/admin/AdminView.tsx`.
 */
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
