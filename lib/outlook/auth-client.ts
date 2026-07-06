/**
 * Bearer-token storage for the Outlook task pane. The pane runs in a third-party
 * iframe (Outlook Web) where the HttpOnly session cookie is unreliable, so it
 * keeps the raw JWT (issued by `verify-otp` with `issueToken: true`) in
 * `localStorage` and sends it as `Authorization: Bearer <jwt>`. The token is an
 * HS256 JWT with a sliding 14-day expiry; on a `401` the panel clears it and
 * returns to the login step.
 */

const TOKEN_KEY = "wistal.outlook.token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage can be blocked (private mode / iframe policy); the pane still
    // works for the current session with the in-memory token.
  }
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore — nothing else to do.
  }
}
