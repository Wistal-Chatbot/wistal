import type { MessageDto, SessionDto } from "@/lib/api/chat-types";
import type {
  QuickActionDto,
  QuickActionOption,
} from "@/lib/api/quick-actions-types";
import { pumpTurnStream, type StreamHandlers } from "@/lib/api/chat-stream";

/**
 * Browser-app access to the chat API. Requests are same-origin and authenticate
 * with the session cookie. The NDJSON stream parser and the DTO→UI adapters are
 * shared with the Outlook task pane via `lib/api/chat-stream`; they're
 * re-exported below so `ChatView` keeps its single `./chatApi` import.
 */

export {
  toSource,
  toMetrics,
  formatSessionTime,
  dtoToUiSession,
  dtoToUiMessage,
  messagesToUi,
} from "@/lib/api/chat-stream";
export type {
  StreamMeta,
  StreamHandlers,
  UiSource,
  UiMetrics,
  UiMessage,
  UiSession,
} from "@/lib/api/chat-stream";

async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let message = "Wystąpił błąd. Spróbuj ponownie.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ── API calls ──────────────────────────────────────────────────────────────

export async function fetchSessions(): Promise<SessionDto[]> {
  const data = await apiFetch<{ sessions: SessionDto[] }>("/api/chat/sessions");
  return data.sessions;
}

export async function createSession(body?: {
  title?: string;
  webSearchEnabled?: boolean;
}): Promise<SessionDto> {
  const data = await apiFetch<{ session: SessionDto }>("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
  return data.session;
}

export async function fetchSession(
  sessionId: string,
): Promise<{ session: SessionDto; messages: MessageDto[] }> {
  return apiFetch<{ session: SessionDto; messages: MessageDto[] }>(
    `/api/chat/sessions/${sessionId}`,
  );
}

/** Renames the session (persists the new title on the chat session row). */
export async function updateSessionTitle(
  sessionId: string,
  title: string,
): Promise<SessionDto> {
  const data = await apiFetch<{ session: SessionDto }>(
    `/api/chat/sessions/${sessionId}`,
    { method: "PATCH", body: JSON.stringify({ title }) },
  );
  return data.session;
}

export async function setWebSearch(
  sessionId: string,
  enabled: boolean,
): Promise<SessionDto> {
  const data = await apiFetch<{ session: SessionDto }>(
    `/api/chat/sessions/${sessionId}/web-search`,
    { method: "PATCH", body: JSON.stringify({ enabled }) },
  );
  return data.session;
}

/** Active quick actions for the composer bar. */
export async function fetchQuickActions(): Promise<QuickActionDto[]> {
  const data = await apiFetch<{ actions: QuickActionDto[] }>(
    "/api/quick-actions",
  );
  return data.actions;
}

/** Searches the rows of a `row_from_table` quick action (chat combobox source). */
export async function fetchQuickActionRows(
  key: string,
  query: string,
): Promise<QuickActionOption[]> {
  const params = new URLSearchParams({ q: query });
  const data = await apiFetch<{ rows: QuickActionOption[] }>(
    `/api/quick-actions/${encodeURIComponent(key)}/rows?${params.toString()}`,
  );
  return data.rows;
}

// ── Streaming a chat turn (NDJSON) ───────────────────────────────────────────

/** Sends a chat message and streams the orchestrator's answer. */
export async function streamMessage(
  sessionId: string,
  message: string,
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, stream: true }),
  });
  return pumpTurnStream(res, handlers);
}

/**
 * Runs a quick action in a session and streams the answer. `input` is the raw
 * user value (or null); the backend validates it against the action's
 * `custom_input` and substitutes it into the stored prompt template.
 */
export async function streamQuickAction(
  key: string,
  sessionId: string,
  input: string | null,
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(
    `/api/quick-actions/${encodeURIComponent(key)}/run`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, input, stream: true }),
    },
  );
  return pumpTurnStream(res, handlers);
}
