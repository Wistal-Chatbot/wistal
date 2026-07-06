import "server-only";

import { cookies, headers } from "next/headers";

import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type SessionPayload,
  type VerifiedSession,
  signToken,
  verifyToken,
} from "./jwt";

// Re-export so existing call sites keep importing session helpers from one place.
export {
  signToken,
  verifyToken,
  SESSION_TTL_SECONDS,
  type SessionPayload,
  type VerifiedSession,
};

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Extracts a Bearer token from the `Authorization` header, or null. */
async function getBearerToken(): Promise<string | null> {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match ? match[1].trim() : null;
}

/**
 * Read and verify the session, from either an `Authorization: Bearer <jwt>`
 * header or the session cookie. The Outlook task pane runs in a third-party
 * iframe where the HttpOnly cookie is unreliable, so it authenticates with a
 * Bearer token in `localStorage`; the browser app keeps using the cookie.
 *
 * The header takes precedence; whichever token is found is verified with the
 * same `verifyToken()` (HS256, sliding 14 days). Returns null when there is no
 * token or it fails verification.
 */
export async function getSessionPayload(): Promise<VerifiedSession | null> {
  const bearer = await getBearerToken();
  const token = bearer ?? (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}
