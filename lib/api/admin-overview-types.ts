/**
 * Wire shapes for the admin „Przegląd" endpoint (`GET /api/admin/overview`). Kept
 * free of `server-only`/`db` imports (like the other `lib/api/*-types.ts`) so the
 * route handler and the client component can share these types.
 *
 * The endpoint returns display-ready values (Polish number formatting + relative
 * time are done server-side) so the frontend only swaps its data source. The shapes
 * deliberately match the prototype's UI models in `lib/mock-data/types.ts`.
 */

/** One KPI tile: label, big value, and a small delta line. */
export interface AdminStatDto {
  label: string;
  value: string;
  delta: string;
  deltaTone: "good" | "muted";
}

/** One bar of the „ostatnie 7 dni" chart. `highlight` marks today. */
export interface WeeklyBarDto {
  day: string;
  pct: number;
  /** Actual query count for the day (shown on hover). */
  count: number;
  highlight?: boolean;
}

/** One row of the „Status systemu" panel. */
export interface SystemStatusDto {
  label: string;
  state: "online" | "warn";
  valueLabel: string;
}

/** One row of the users table. */
export interface AdminUserDto {
  name: string;
  role: string;
  queries: number;
  lastActive: string;
  status: "Aktywny" | "Bezczynny";
}

/** Full payload for the overview page. */
export interface AdminOverviewResponse {
  stats: AdminStatDto[];
  weeklyQueries: WeeklyBarDto[];
  systemStatus: SystemStatusDto[];
  users: AdminUserDto[];
}
