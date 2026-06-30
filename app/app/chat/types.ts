/**
 * UI-shaped chat types, local to the chat feature. They decouple `ChatView` from
 * the prototype mock-data types now that the screen is backed by the real API.
 */

export interface UiSource {
  /** Source tables, shown as a mono pill. */
  tables: string;
  /** e.g. "3 wier.". */
  rows: string;
  /** Query time, e.g. "68 ms". */
  ms: string;
}

export interface UiMessage {
  id: string;
  role: "user" | "bot";
  time: string;
  /** Markdown for bot answers; plain text for user messages. */
  content: string;
  /** Set only for bot answers that ran SQL. */
  source?: UiSource | null;
  /** True while the answer is still streaming in. */
  pending?: boolean;
}

export interface UiSession {
  id: string;
  title: string;
  time: string;
}
