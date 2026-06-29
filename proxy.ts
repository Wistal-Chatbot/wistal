import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  shouldRefresh,
  signToken,
  verifyToken,
} from "@/lib/auth/jwt";

/**
 * Sliding-session refresh (Next.js 16 Proxy — the renamed `middleware`).
 *
 * Route protection / login redirects live in the `/app` layout and page guards.
 * This Proxy's only job is to keep an *active* user signed in: on each request
 * under `/app`, if the session token is valid and has aged past the refresh
 * interval, re-issue it with a fresh 14-day expiry and reset the cookie. A
 * missing or invalid token is left alone — the layout guard redirects to /login.
 */
export const config = {
  matcher: ["/app", "/app/:path*"],
};

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.next();
  }

  let session;
  try {
    session = await verifyToken(token);
  } catch {
    // Invalid / expired — let the layout guard handle the redirect to /login.
    return NextResponse.next();
  }

  if (!shouldRefresh(session.iat)) {
    return NextResponse.next();
  }

  const refreshed = await signToken({
    sub: session.sub,
    email: session.email,
    isAdmin: session.isAdmin,
  });

  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE_NAME, refreshed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
