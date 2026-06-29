import { SignJWT, jwtVerify } from "jose";

/**
 * Runtime-safe JWT helpers for the session cookie. Kept free of `server-only`
 * and `next/headers` so it can be imported from both Server Components (via
 * `session.ts`) and `proxy.ts`, which runs outside the React render context.
 *
 * The session is a **sliding 14-day window**: the cookie + token are re-issued
 * on activity (see `proxy.ts`), so a user stays logged in as long as they use
 * the app at least once every 14 days, and is logged out after 14 consecutive
 * days of inactivity.
 */

export const SESSION_COOKIE_NAME = "session";

/** Sliding window length — logged out after this long without activity. */
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

/**
 * While a user stays active, re-issue the token at most this often. Bounds the
 * refresh work to ~once per day per active user; the practical idle-logout point
 * lands within this interval of the true 14-day mark.
 */
export const SESSION_REFRESH_AFTER_SECONDS = 24 * 60 * 60; // 1 day

export interface SessionPayload {
  sub: string; // app_users.id
  email: string;
  isAdmin: boolean;
}

export interface VerifiedSession extends SessionPayload {
  /** Issued-at (epoch seconds), from the verified JWT. */
  iat: number;
  /** Expiry (epoch seconds), from the verified JWT. */
  exp: number;
}

function getKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: SessionPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(getKey());
}

export async function verifyToken(token: string): Promise<VerifiedSession> {
  const { payload } = await jwtVerify(token, getKey(), {
    algorithms: ["HS256"],
  });
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    isAdmin: payload.isAdmin as boolean,
    iat: payload.iat as number,
    exp: payload.exp as number,
  };
}

/**
 * True when a still-valid token has aged past the refresh interval and is worth
 * re-issuing to extend the sliding window.
 */
export function shouldRefresh(
  iatSeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  return nowSeconds - iatSeconds >= SESSION_REFRESH_AFTER_SECONDS;
}
