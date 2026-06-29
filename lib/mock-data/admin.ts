import type { AdminStat, AdminUser, SystemStatusItem, WeeklyBar } from "./types";

/**
 * Mock admin overview data: stat cards, the 7-day query chart, system status,
 * and the users table. Mirrors the admin "Przegląd" tab of the prototype.
 */

export const adminStats: AdminStat[] = [
  { label: "Aktywni użytkownicy", value: "24", delta: "+3 w tym tygodniu", deltaTone: "good" },
  { label: "Zapytania dziś", value: "1 284", delta: "+12% d/d", deltaTone: "good" },
  { label: "Koszt AI / mies.", value: "2 140 zł", delta: "68% limitu", deltaTone: "muted" },
  { label: "Śr. czas odpowiedzi", value: "1,8 s", delta: "−0,3 s", deltaTone: "good" },
];

export const weeklyQueries: WeeklyBar[] = [
  { day: "Pn", pct: 62 },
  { day: "Wt", pct: 78 },
  { day: "Śr", pct: 54 },
  { day: "Cz", pct: 88 },
  { day: "Pt", pct: 100, highlight: true },
  { day: "So", pct: 34 },
  { day: "Nd", pct: 22 },
];

export const systemStatus: SystemStatusItem[] = [
  { label: "API danych", state: "online", valueLabel: "Online" },
  { label: "Model językowy", state: "online", valueLabel: "Online" },
  { label: "Kolejka zadań", state: "warn", valueLabel: "3 oczekuje" },
];

export const adminUsers: AdminUser[] = [
  { name: "Anna Nowak", role: "Handel", queries: 312, lastActive: "2 min temu", status: "Aktywny" },
  { name: "Jan Kowalski", role: "Handel", queries: 268, lastActive: "teraz", status: "Aktywny" },
  { name: "Marek Wójcik", role: "Magazyn", queries: 154, lastActive: "18 min temu", status: "Aktywny" },
  { name: "Ewa Lis", role: "Księgowość", queries: 87, lastActive: "3 godz. temu", status: "Bezczynny" },
  { name: "Piotr Zając", role: "Administrator", queries: 45, lastActive: "wczoraj", status: "Bezczynny" },
];
