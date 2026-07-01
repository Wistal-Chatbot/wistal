import type {
  MessageDto,
  SessionDto,
  TokenUsageMetadata,
} from "@/lib/api/chat-types";
import type { QuickActionDto } from "@/lib/api/quick-actions-types";

import type { UiMessage, UiMetrics, UiSession, UiSource } from "./types";

/**
 * Client-side access to the chat API plus adapters that map the DB-shaped DTOs
 * onto the UI types `ChatView` renders. Bot answers are Markdown; their "source"
 * pill comes from query metadata (live via the stream, or persisted on reload).
 */

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

/** Active quick actions for the composer bar (options resolved server-side). */
export async function fetchQuickActions(): Promise<QuickActionDto[]> {
  const data = await apiFetch<{ actions: QuickActionDto[] }>(
    "/api/quick-actions",
  );
  return data.actions;
}

// ── Streaming a chat turn (NDJSON) ───────────────────────────────────────────

export interface StreamMeta {
  messageId: number;
  tables: string[];
  rowCount: number | null;
  executionMs: number | null;
  responseMs: number | null;
  queryAuditId: number | null;
  tokensUsed: number | null;
  tokenUsage: TokenUsageMetadata | null;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onMeta: (
    source: UiSource | null,
    metrics: UiMetrics | null,
    meta: StreamMeta,
  ) => void;
  onError: (message: string) => void;
}

/**
 * Consumes an NDJSON turn stream (from the chat or quick-action endpoint),
 * dispatching `delta` / `meta` / `error` frames to the handlers. Both endpoints
 * emit the same `ChatTurnEvent` frames, so the plumbing is shared.
 */
async function pumpTurnStream(
  res: Response,
  handlers: StreamHandlers,
): Promise<void> {
  if (!res.ok || !res.body) {
    let msg = "Wystąpił błąd. Spróbuj ponownie.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) msg = data.error;
    } catch {
      // keep generic message
    }
    handlers.onError(msg);
    return;
  }

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: { type?: string; text?: string; error?: string } & Partial<StreamMeta>;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (event.type === "delta" && typeof event.text === "string") {
      handlers.onDelta(event.text);
    } else if (event.type === "meta") {
      const meta: StreamMeta = {
        messageId: event.messageId ?? 0,
        tables: event.tables ?? [],
        rowCount: event.rowCount ?? null,
        executionMs: event.executionMs ?? null,
        responseMs: event.responseMs ?? null,
        queryAuditId: event.queryAuditId ?? null,
        tokensUsed: event.tokensUsed ?? null,
        tokenUsage: event.tokenUsage ?? null,
      };
      handlers.onMeta(
        toSource(meta.tables, meta.rowCount),
        toMetrics(meta.responseMs, meta.tokensUsed),
        meta,
      );
    } else if (event.type === "error" && typeof event.error === "string") {
      handlers.onError(event.error);
    }
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      handleLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer);
}

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

// ── Adapters: DB DTO → UI types ──────────────────────────────────────────────

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Relative session timestamp in the prototype's style. */
export function formatSessionTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDiff === 0) return `Dzisiaj, ${timeOf(iso)}`;
  if (dayDiff === 1) return `Wczoraj, ${timeOf(iso)}`;

  const day = date.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${day}, ${timeOf(iso)}`;
}

/** Builds the "Źródło danych" pill, or null for answers that ran no SQL. */
export function toSource(
  tables: string[],
  rowCount: number | null,
): UiSource | null {
  if (tables.length === 0 && rowCount === null) return null;
  return {
    tables: tables.length > 0 ? tables.join(", ") : "—",
    rows: rowCount !== null ? `${rowCount} wier.` : "—",
  };
}

const integerFormatter = new Intl.NumberFormat("pl-PL");

function formatDuration(ms: number): string {
  if (ms < 1000) return `${integerFormatter.format(ms)} ms`;
  return `${(ms / 1000).toLocaleString("pl-PL", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })} s`;
}

function formatTokens(tokens: number): string {
  return `${integerFormatter.format(tokens)} tok.`;
}

export function toMetrics(
  responseMs: number | null,
  tokensUsed: number | null,
): UiMetrics | null {
  if (responseMs === null && tokensUsed === null) return null;
  return {
    responseTime: responseMs !== null ? formatDuration(responseMs) : "—",
    tokens: tokensUsed !== null ? formatTokens(tokensUsed) : "—",
  };
}

export function dtoToUiSession(dto: SessionDto): UiSession {
  return {
    id: dto.id,
    title: dto.title ?? "Nowa rozmowa",
    time: formatSessionTime(dto.lastMessageAt ?? dto.updatedAt ?? dto.createdAt),
  };
}

export function dtoToUiMessage(dto: MessageDto): UiMessage {
  const time = timeOf(dto.createdAt);
  if (dto.messageType === "user") {
    return { id: String(dto.id), role: "user", time, content: dto.content };
  }
  return {
    id: String(dto.id),
    role: "bot",
    time,
    content: dto.content,
    source: toSource(dto.metadata.tables, dto.rowCount),
    metrics: toMetrics(dto.metadata.responseMs, dto.metadata.tokensUsed),
  };
}

/** Maps persisted messages to UI messages, keeping only user/assistant turns. */
export function messagesToUi(dtos: MessageDto[]): UiMessage[] {
  return dtos
    .filter((m) => m.messageType === "user" || m.messageType === "assistant")
    .map(dtoToUiMessage);
}
