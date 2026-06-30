import type { MessageDto, SessionDto } from "@/lib/api/chat-types";
import type { ChatMessage, ChatSession } from "@/lib/mock-data";

/**
 * Client-side access to the chat session API plus adapters that map the DB-shaped
 * DTOs onto the UI types the prototype `ChatView` renders. The rich `source`
 * metadata on assistant bubbles comes from the (separate) message pipeline, so
 * loaded messages render as plain text blocks here.
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

// ── Adapters: DB DTO → prototype UI types ────────────────────────────────────

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

export function dtoToUiSession(dto: SessionDto): ChatSession {
  return {
    id: dto.id,
    title: dto.title ?? "Nowa rozmowa",
    time: formatSessionTime(dto.lastMessageAt ?? dto.updatedAt ?? dto.createdAt),
    // The schema has no chat/akcja distinction yet — default everything to chat.
    tag: "chat",
    messages: [],
  };
}

export function dtoToUiMessage(dto: MessageDto): ChatMessage {
  const time = timeOf(dto.createdAt);
  if (dto.messageType === "user") {
    return { id: String(dto.id), role: "user", time, text: dto.content };
  }
  return {
    id: String(dto.id),
    role: "bot",
    time,
    blocks: [{ type: "text", parts: [{ text: dto.content }] }],
  };
}

/** Maps persisted messages to UI messages, keeping only user/assistant turns. */
export function messagesToUi(dtos: MessageDto[]): ChatMessage[] {
  return dtos
    .filter((m) => m.messageType === "user" || m.messageType === "assistant")
    .map(dtoToUiMessage);
}
