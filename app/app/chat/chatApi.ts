import type {
  MessageDto,
  SessionDto,
  TokenUsageMetadata,
} from "@/lib/api/chat-types";
import type {
  QuickActionDto,
  QuickActionOption,
} from "@/lib/api/quick-actions-types";

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
  signal?: AbortSignal,
): Promise<{ session: SessionDto; messages: MessageDto[] }> {
  return apiFetch<{ session: SessionDto; messages: MessageDto[] }>(
    `/api/chat/sessions/${sessionId}`,
    { signal },
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

export interface StreamMeta {
  messageId: number;
  userMessageId: number;
  tables: string[];
  rowCount: number | null;
  executionMs: number | null;
  responseMs: number | null;
  queryAuditId: number | null;
  tokensUsed: number | null;
  tokenUsage: TokenUsageMetadata | null;
}

export interface StreamHandlers {
  onStatus: (text: string) => void;
  onDelta: (text: string) => void;
  onMeta: (
    source: UiSource | null,
    metrics: UiMetrics | null,
    meta: StreamMeta,
  ) => void;
  onError: (error: StreamError) => void;
}

export interface StreamError {
  message: string;
  messageId: number | null;
  userMessageId: number | null;
  errorCode: string | null;
  retryable: boolean;
  isRetried: boolean;
}

type TurnStreamFrameType = "status" | "delta" | "meta" | "error" | null;

/**
 * Consumes an NDJSON turn stream (from the chat or quick-action endpoint),
 * dispatching `status` / `delta` / `meta` / `error` frames to the handlers.
 * Both endpoints emit the same `ChatTurnEvent` frames, so the plumbing is shared.
 */
export function dispatchTurnStreamLine(
  line: string,
  handlers: StreamHandlers,
): TurnStreamFrameType {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let event: {
    type?: string;
    text?: string;
    error?: string;
    messageId?: number | null;
    userMessageId?: number | null;
    errorCode?: string;
    retryable?: boolean;
    isRetried?: boolean;
    tables?: string[];
    rowCount?: number | null;
    executionMs?: number | null;
    responseMs?: number | null;
    queryAuditId?: number | null;
    tokensUsed?: number | null;
    tokenUsage?: TokenUsageMetadata | null;
  };
  try {
    event = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (event.type === "status" && typeof event.text === "string") {
    handlers.onStatus(event.text);
    return "status";
  } else if (event.type === "delta" && typeof event.text === "string") {
    handlers.onDelta(event.text);
    return "delta";
  } else if (
    event.type === "meta" &&
    typeof event.messageId === "number" &&
    event.messageId > 0 &&
    typeof event.userMessageId === "number" &&
    event.userMessageId > 0
  ) {
    const meta: StreamMeta = {
      messageId: event.messageId,
      userMessageId: event.userMessageId,
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
    return "meta";
  } else if (event.type === "error" && typeof event.error === "string") {
    handlers.onError({
      message: event.error,
      messageId:
        typeof event.messageId === "number" ? event.messageId : null,
      userMessageId:
        typeof event.userMessageId === "number" ? event.userMessageId : null,
      errorCode:
        typeof event.errorCode === "string" ? event.errorCode : null,
      retryable: event.retryable === true,
      isRetried: event.isRetried === true,
    });
    return "error";
  }
  return null;
}

export async function pumpTurnStream(
  res: Response,
  handlers: StreamHandlers,
): Promise<void> {
  if (!res.ok || !res.body) {
    const serverFailure = res.status >= 500 || (res.ok && !res.body);
    let error: StreamError = {
      message: "Wystąpił błąd. Spróbuj ponownie.",
      messageId: null,
      userMessageId: null,
      errorCode: serverFailure ? "CHAT_SERVER_ERROR" : null,
      retryable: serverFailure,
      isRetried: false,
    };
    try {
      const data = (await res.json()) as {
        error?: string;
        messageId?: number;
        userMessageId?: number;
        errorCode?: string;
        code?: string;
        retryable?: boolean;
        isRetried?: boolean;
      };
      error = {
        message: data.error ?? error.message,
        messageId:
          typeof data.messageId === "number" ? data.messageId : null,
        userMessageId:
          typeof data.userMessageId === "number" ? data.userMessageId : null,
        errorCode:
          typeof data.errorCode === "string"
            ? data.errorCode
            : typeof data.code === "string"
              ? data.code
              : "CHAT_REQUEST_FAILED",
        retryable: data.retryable === true || serverFailure,
        isRetried: data.isRetried === true,
      };
    } catch {
      // keep generic message
    }
    handlers.onError(error);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminalReceived = false;
  const terminalHandlers: StreamHandlers = {
    ...handlers,
    onMeta: (source, metrics, meta) => {
      terminalReceived = true;
      handlers.onMeta(source, metrics, meta);
    },
    onError: (error) => {
      terminalReceived = true;
      handlers.onError(error);
    },
  };

  const cancelAfterTerminal = async () => {
    try {
      await reader.cancel();
    } catch {
      // The terminal event was already handled; transport cleanup is best effort.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      dispatchTurnStreamLine(buffer.slice(0, nl), terminalHandlers);
      buffer = buffer.slice(nl + 1);
      if (terminalReceived) {
        await cancelAfterTerminal();
        return;
      }
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    dispatchTurnStreamLine(buffer, terminalHandlers);
  }
  if (terminalReceived) return;

  handlers.onError({
    message:
      "Połączenie zakończyło się przed zapisaniem odpowiedzi. Spróbuj ponownie.",
    messageId: null,
    userMessageId: null,
    errorCode: "CHAT_STREAM_INCOMPLETE",
    retryable: true,
    isRetried: false,
  });
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

export async function retryMessage(
  sessionId: string,
  messageId: string,
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(
    `/api/chat/sessions/${sessionId}/messages/${messageId}/retry`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    },
  );
  return pumpTurnStream(res, handlers);
}

/** Regenerates the latest turn without inserting the user message again. */
export async function redoLatestMessage(
  sessionId: string,
  userMessageId: number,
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(
    `/api/chat/sessions/${sessionId}/messages/redo`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessageId }),
    },
  );
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
    errorCode: dto.errorCode,
    retryable: dto.retryable,
    isRetried: dto.isRetried,
  };
}

/** Maps persisted messages to UI messages, keeping only user/assistant turns. */
export function messagesToUi(dtos: MessageDto[]): UiMessage[] {
  return dtos
    .filter(
      (m) =>
        (m.messageType === "user" || m.messageType === "assistant") &&
        !m.isRetried,
    )
    .map(dtoToUiMessage);
}
