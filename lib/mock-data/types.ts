/**
 * Data models for the Wistal ERP dashboard UI.
 *
 * These mirror the shapes used by the Claude Design prototype
 * (`wistal-erp-chatbot-ui/project/Wistal ERP Dashboard.dc.html`). They drive the
 * mock/test data in this folder so the frontend can be built and demoed before
 * the real `/api/*` handlers are wired in. They are intentionally UI-shaped
 * (display strings, badge tones) rather than raw DB rows.
 */

// ── ERP data browser (Dane) ───────────────────────────────────────────────

export type ColumnAlign = "left" | "right";

export interface TableColumn {
  key: string;
  label: string;
  /** Render with IBM Plex Mono (codes, numbers, amounts). */
  mono?: boolean;
  align?: ColumnAlign;
  /** Render the value as a colored status pill. */
  badge?: boolean;
}

export type TableCellValue = string | number | null;

export type TableRecord = Record<string, TableCellValue>;

export interface TableDef {
  /** Stable identifier, e.g. `"towary"`. */
  key: string;
  /** Human label shown in the selector, e.g. `"Towary"`. */
  label: string;
  /** Short description shown in the table selector dropdown. */
  desc: string;
  columns: TableColumn[];
  rows: TableRecord[];
}

// ── Chat ──────────────────────────────────────────────────────────────────

export type ChatRole = "bot" | "user";

export interface TextSegment {
  text: string;
  bold?: boolean;
}

export interface Bullet {
  label: string;
  rest: string;
}

export type MessageBlock =
  | { type: "text"; parts: TextSegment[] }
  | { type: "list"; bullets: Bullet[] };

export interface ChatSource {
  /** Source table(s), shown as a mono pill. */
  tables: string;
  /** e.g. `"3 wiersze"`. */
  rows: string;
  /** Query time, e.g. `"68 ms"`. */
  ms: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  time: string;
  /** User messages. */
  text?: string;
  /** Bot messages. */
  blocks?: MessageBlock[];
  source?: ChatSource;
}

export type SessionTag = "chat" | "akcja";

export interface ChatSession {
  id: string;
  title: string;
  time: string;
  tag: SessionTag;
  messages: ChatMessage[];
}

// ── Quick actions (Szybkie akcje) ──────────────────────────────────────────

export interface QuickActionInput {
  label: string;
  placeholder: string;
}

export interface QuickAction {
  key: string;
  name: string;
  enabled: boolean;
  /** Prompt sent directly when the action has no input field. */
  prompt?: string;
  /** When present, clicking opens a mini-form before sending. */
  input?: QuickActionInput | null;
}

// ── AI reports (Raporty AI) ────────────────────────────────────────────────

export interface AiReport {
  id: string;
  name: string;
  desc: string;
  active: boolean;
  tables: string;
}

export type RunStatus = "Zakończone" | "W toku" | "Błąd";

export interface ReportRun {
  /** Report id this run belongs to, for routing. */
  reportId: string;
  title: string;
  date: string;
  user: string;
  status: RunStatus;
}

export type Tone = "good" | "warn" | "bad";

export interface RiskBar {
  label: string;
  valueLabel: string;
  tone: Tone;
  pct: number;
}

export interface FinancialYear {
  year: string;
  revenue: string;
  profit: string;
  profitTone: "good" | "bad";
}

export interface AuditReport {
  reportId: string;
  score: number;
  scoreMax: number;
  scorePct: number;
  eyebrow: string;
  company: string;
  meta: string;
  riskLabel: string;
  riskTone: Tone;
  riskBars: RiskBar[];
  financials: FinancialYear[];
  financialsSource: string;
  recommendation: TextSegment[];
  genTime: string;
  tables: string;
}

// ── Admin ──────────────────────────────────────────────────────────────────

export interface AdminStat {
  label: string;
  value: string;
  delta: string;
  deltaTone: "good" | "muted";
}

export interface WeeklyBar {
  day: string;
  pct: number;
  highlight?: boolean;
}

export interface SystemStatusItem {
  label: string;
  state: "online" | "warn";
  valueLabel: string;
}

export interface AdminUser {
  name: string;
  role: string;
  queries: number;
  lastActive: string;
  status: "Aktywny" | "Bezczynny";
}

// ── Current user ─────────────────────────────────────────────────────────────

export interface CurrentUser {
  name: string;
  initials: string;
  email: string;
  role: string;
  isAdmin: boolean;
}
