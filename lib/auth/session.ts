import "server-only";

import { cookies } from "next/headers";

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

/** Read and verify the session cookie. Returns null if missing or invalid. */
export async function getSessionPayload(): Promise<VerifiedSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}
