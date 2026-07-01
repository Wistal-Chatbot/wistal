import "server-only";

import type { AppUser } from "@/lib/db/schema";
import { getCurrentUser } from "./current-user";

export type AdminGuard =
  | { ok: true; user: AppUser }
  | { ok: false; response: Response };

/**
 * Guard for admin-only route handlers: 401 when there is no valid session, 403
 * when the user is authenticated but not an admin. On success returns the live
 * `app_users` row so `is_admin` reflects the current DB state.
 */
export async function requireAdmin(): Promise<AdminGuard> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Brak autoryzacji." }, { status: 401 }),
    };
  }
  if (!user.isAdmin) {
    return {
      ok: false,
      response: Response.json({ error: "Brak uprawnień." }, { status: 403 }),
    };
  }
  return { ok: true, user };
}
