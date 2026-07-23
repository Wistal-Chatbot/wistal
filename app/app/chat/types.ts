/**
 * UI-shaped chat types, local to the chat feature. They decouple `ChatView` from
 * the prototype mock-data types now that the screen is backed by the real API.
 */

export interface UiSource {
  /** Source tables, shown as a mono pill. */
  tables: string;
  /** e.g. "3 wier.". */
  rows: string;
}

export interface UiMetrics {
  /** Full answer generation/orchestration time, e.g. "1,2 s". */
  responseTime: string;
  /** Total Anthropic usage for the answer, e.g. "1 420 tok.". */
  tokens: string;
}

export interface UiMessage {
  id: string;
  role: "user" | "bot";
  time: string;
  /** Markdown for bot answers; plain text for user messages. */
  content: string;
  /** Set only for bot answers that ran SQL. */
  source?: UiSource | null;
  /** Observability metadata for completed bot answers. */
  metrics?: UiMetrics | null;
  /** True while the answer is still streaming in. */
  pending?: boolean;
  /** Ephemeral progress copy; never loaded from or saved to the database. */
  workingStatus?: string | null;
  /** Keeps the status mounted briefly while its exit animation runs. */
  workingStatusLeaving?: boolean;
  /** Persisted assistant failure; rendered as a dedicated alert card. */
  errorCode?: string | null;
  retryable?: boolean;
  isRetried?: boolean;
}

export interface UiSession {
  id: string;
  title: string;
  time: string;
}
