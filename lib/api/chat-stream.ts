import type {
  MessageDto,
  SessionDto,
  TokenUsageMetadata,
} from "@/lib/api/chat-types";

/**
 * Transport-neutral chat plumbing shared by every client of the chat API:
 * the NDJSON turn-stream parser plus the adapters that map DB-shaped DTOs onto
 * the UI types the views render. Kept free of `server-only`, `next/*` and any
 * `fetch` credential/auth policy so it can be imported by both the browser app
 * (`app/app/chat/chatApi.ts`, cookie auth) and the Outlook task pane
 * (`app/outlook/outlookApi.ts`, Bearer auth). Each caller does its own `fetch`
 * and hands the `Response` here.
 */

// ── UI-shaped types ──────────────────────────────────────────────────────────

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
}

export interface UiSession {
  id: string;
  title: string;
  time: string;
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
export async function pumpTurnStream(
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
