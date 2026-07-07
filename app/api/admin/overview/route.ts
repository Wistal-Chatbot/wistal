import type {
  AdminOverviewResponse,
  AdminStatDto,
  AdminUserDto,
  WeeklyBarDto,
} from "@/lib/api/admin-overview-types";
import { getMonthlyAiSpend, type MonthlyAiSpend } from "@/lib/ai/token-usage";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getAvgResponseStats,
  getQueriesLast7Days,
  getQueryCountStats,
  getSystemStatus,
  getUserOverviewStats,
  getUsersOverview,
  type AvgResponseStats,
  type DailyCount,
  type QueryCountStats,
  type UserOverviewRow,
} from "@/lib/db/queries";
import { log } from "@/lib/log";

// ── Formatting helpers (display-ready values, Polish) ────────────────────────

const intFmt = new Intl.NumberFormat("pl-PL");
const usdFmt = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "USD",
});
const secFmt = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dayFmt = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/** Billing period as „01.07.2026 – 31.07.2026" (from date – end date). */
function formatBillingPeriod(start: Date, end: Date): string {
  return `${dayFmt.format(start)} – ${dayFmt.format(end)}`;
}

/** Two-letter Polish weekday labels, indexed by JS `getUTCDay()` (0 = Sun). */
const PL_DOW = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

/** Day-over-day percent change as a signed „% d/d" string + tone. */
function pctDelta(today: number, yesterday: number): {
  delta: string;
  deltaTone: "good" | "muted";
} {
  if (yesterday === 0) {
    return today > 0
      ? { delta: "+100% d/d", deltaTone: "good" }
      : { delta: "bez zmian d/d", deltaTone: "muted" };
  }
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  if (pct > 0) return { delta: `+${pct}% d/d`, deltaTone: "good" };
  if (pct < 0) return { delta: `−${Math.abs(pct)}% d/d`, deltaTone: "muted" };
  return { delta: "bez zmian d/d", deltaTone: "muted" };
}

/** Mean SQL time formatted as „1,8 s" (or „—" when there were no queries). */
function formatSeconds(ms: number | null): string {
  if (ms == null) return "—";
  return `${secFmt.format(ms / 1000)} s`;
}

/** Response-time delta („−0,3 s"); faster (a drop) is the good direction. */
function responseDelta(stats: AvgResponseStats): {
  delta: string;
  deltaTone: "good" | "muted";
} {
  const { todayMs, yesterdayMs } = stats;
  if (todayMs == null || yesterdayMs == null) {
    return { delta: "—", deltaTone: "muted" };
  }
  const diffSec = (todayMs - yesterdayMs) / 1000;
  if (Math.abs(diffSec) < 0.05) return { delta: "bez zmian", deltaTone: "muted" };
  const abs = secFmt.format(Math.abs(diffSec));
  return diffSec < 0
    ? { delta: `−${abs} s`, deltaTone: "good" }
    : { delta: `+${abs} s`, deltaTone: "muted" };
}

/** Human „ile temu" label for the users table, in Polish. */
function relativeTimePl(date: Date | null): string {
  if (!date) return "brak aktywności";
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "teraz";
  if (min < 60) return `${min} min temu`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} godz. temu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "wczoraj";
  if (days < 7) return `${days} dni temu`;
  return date.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** „Aktywny" when the last sign of life was within 15 minutes. */
function activityStatus(date: Date | null): "Aktywny" | "Bezczynny" {
  if (!date) return "Bezczynny";
  return Date.now() - date.getTime() <= 15 * 60_000 ? "Aktywny" : "Bezczynny";
}

function buildStats(
  users: { activeUsers: number; newThisWeek: number },
  queries: QueryCountStats,
  response: AvgResponseStats,
  spend: MonthlyAiSpend,
): AdminStatDto[] {
  const queriesDelta = pctDelta(queries.today, queries.yesterday);
  const respDelta = responseDelta(response);

  return [
    {
      label: "Aktywni użytkownicy",
      value: intFmt.format(users.activeUsers),
      delta:
        users.newThisWeek > 0
          ? `+${users.newThisWeek} w tym tygodniu`
          : "bez zmian w tym tygodniu",
      deltaTone: users.newThisWeek > 0 ? "good" : "muted",
    },
    {
      label: "Zapytania dziś",
      value: intFmt.format(queries.today),
      delta: queriesDelta.delta,
      deltaTone: queriesDelta.deltaTone,
    },
    {
      label: "Zużycie AI / mies.",
      value: spend.spendUsd !== null ? usdFmt.format(spend.spendUsd) : "—",
      delta: formatBillingPeriod(spend.periodStart, spend.periodEnd),
      deltaTone: "muted",
    },
    {
      label: "Śr. czas odpowiedzi",
      value: formatSeconds(response.todayMs),
      delta: respDelta.delta,
      deltaTone: respDelta.deltaTone,
    },
  ];
}

function buildWeekly(rows: DailyCount[]): WeeklyBarDto[] {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return rows.map((r, i) => ({
    day: PL_DOW[new Date(`${r.date}T12:00:00Z`).getUTCDay()],
    pct: Math.round((r.count / max) * 100),
    count: r.count,
    highlight: i === rows.length - 1,
  }));
}

function buildUser(row: UserOverviewRow): AdminUserDto {
  return {
    name: row.name?.trim() || row.email,
    role: row.isAdmin ? "Administrator" : "Użytkownik",
    queries: row.monthlyQueries,
    lastActive: relativeTimePl(row.lastActivity),
    status: activityStatus(row.lastActivity),
  };
}

/** GET — aggregated stats for the admin „Przegląd" overview page. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const [users, queries, response, weekly, userRows, systemStatus, spend] =
      await Promise.all([
        getUserOverviewStats(),
        getQueryCountStats(),
        getAvgResponseStats(),
        getQueriesLast7Days(),
        getUsersOverview(),
        getSystemStatus(),
        getMonthlyAiSpend(),
      ]);

    const body: AdminOverviewResponse = {
      stats: buildStats(users, queries, response, spend),
      weeklyQueries: buildWeekly(weekly),
      systemStatus: systemStatus.map((s) => ({
        label: s.label,
        state: s.online ? "online" : "warn",
        valueLabel: s.valueLabel,
      })),
      users: userRows.map(buildUser),
    };

    return Response.json(body);
  } catch (error) {
    log.error("admin.overview", "load failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: "Nie udało się wczytać przeglądu." },
      { status: 500 },
    );
  }
}
