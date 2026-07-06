import type { SessionDto } from "@/lib/api/chat-types";
import type {
  QuickActionDto,
  QuickActionOption,
} from "@/lib/api/quick-actions-types";
import {
  pumpTurnStream,
  type StreamHandlers,
  type UiMessage,
} from "@/lib/api/chat-stream";
import {
  clearStoredToken,
  getStoredToken,
  storeToken,
} from "@/lib/outlook/auth-client";

/**
 * Task-pane API client. Same endpoints as the browser app, but same-origin
 * requests carry an `Authorization: Bearer <jwt>` header (see
 * `lib/outlook/auth-client`) instead of the session cookie. On any `401` the
 * stored token is cleared and the registered handler flips the panel back to
 * the login step. The NDJSON parser and DTO→UI adapters are the shared ones from
 * `lib/api/chat-stream`, so answers render identically to `/app/chat`.
 */

export interface PanelUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

/** Thrown when the token is missing/expired; callers return to login. */
export class UnauthorizedError extends Error {
  constructor(message = "Sesja wygasła. Zaloguj się ponownie.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Registers the callback that returns the UI to the login step on a 401. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getStoredToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function readErrorMessage(res: Response): Promise<string> {
  if (res.status === 429) return "Za dużo prób. Spróbuj ponownie za kilka minut.";
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // Non-JSON body — fall through to the generic message.
  }
  return "Wystąpił błąd. Spróbuj ponownie.";
}

/** On a 401: clear the token, notify the app, and throw `UnauthorizedError`. */
function handleUnauthorized(): never {
  clearStoredToken();
  unauthorizedHandler?.();
  throw new UnauthorizedError();
}

async function authedFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: authHeaders(init?.headers as Record<string, string> | undefined),
  });

  if (res.status === 401) handleUnauthorized();
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

/** Requests a one-time login code for `email` (no token yet). */
export async function requestOtp(email: string): Promise<void> {
  const res = await fetch("/api/auth/request-otp", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
}

/**
 * Verifies the code with `issueToken: true`, stores the returned JWT, and
 * returns the signed-in user. Throws with a Polish message on failure.
 */
export async function verifyOtp(
  email: string,
  code: string,
): Promise<PanelUser> {
  const res = await fetch("/api/auth/verify-otp", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, issueToken: true }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));

  const data = (await res.json()) as { user: PanelUser; token?: string };
  if (!data.token) {
    throw new Error("Serwer nie zwrócił tokenu. Skontaktuj się z administratorem.");
  }
  storeToken(data.token);
  return data.user;
}

/** Validates the stored token on panel start; throws `UnauthorizedError` if invalid. */
export async function fetchMe(): Promise<PanelUser> {
  const data = await authedFetch<{ user: PanelUser }>("/api/me");
  return data.user;
}

// ── Chat + quick actions ──────────────────────────────────────────────────────

export async function createSession(): Promise<SessionDto> {
  const data = await authedFetch<{ session: SessionDto }>("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.session;
}

export async function fetchQuickActions(): Promise<QuickActionDto[]> {
  const data = await authedFetch<{ actions: QuickActionDto[] }>(
    "/api/quick-actions",
  );
  return data.actions;
}

export async function fetchQuickActionRows(
  key: string,
  query: string,
): Promise<QuickActionOption[]> {
  const params = new URLSearchParams({ q: query });
  const data = await authedFetch<{ rows: QuickActionOption[] }>(
    `/api/quick-actions/${encodeURIComponent(key)}/rows?${params.toString()}`,
  );
  return data.rows;
}

/** Sends a chat message and streams the answer (Bearer-authenticated). */
export async function streamMessage(
  sessionId: string,
  message: string,
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    cache: "no-store",
    headers: authHeaders(),
    body: JSON.stringify({ message, stream: true }),
  });
  if (res.status === 401) handleUnauthorized();
  return pumpTurnStream(res, handlers);
}

/** Runs a quick action in a session and streams the answer. */
export async function streamQuickAction(
  key: string,
  sessionId: string,
  input: string | null,
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(`/api/quick-actions/${encodeURIComponent(key)}/run`, {
    method: "POST",
    cache: "no-store",
    headers: authHeaders(),
    body: JSON.stringify({ session_id: sessionId, input, stream: true }),
  });
  if (res.status === 401) handleUnauthorized();
  return pumpTurnStream(res, handlers);
}

// Re-exported so panel components import stream types from one module.
export type { StreamHandlers, UiMessage };
