import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { appUsers, type AppUser } from "@/lib/db/schema";
import { getSessionPayload } from "./session";

/**
 * The reusable auth guard for protected route handlers. Verifies the session
 * cookie, then loads the live app_users row so is_active / is_admin reflect the
 * current state rather than what was true at login. Returns null when there is
 * no valid session or the user no longer exists / is inactive.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const session = await getSessionPayload();
  if (!session) return null;

  const [user] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.id, session.sub))
    .limit(1);

  if (!user || !user.isActive) return null;
  return user;
}
