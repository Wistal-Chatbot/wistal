import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { appUsers, type AppUser } from "@/lib/db/schema";

/**
 * Resolve the user for a successful OTP login: create the row on first login,
 * otherwise refresh last_login_at. The email is assumed already normalized and
 * validated against the active auth-domain policy.
 */
export async function loginUser(email: string): Promise<AppUser> {
  const [user] = await db
    .insert(appUsers)
    .values({ email, lastLoginAt: sql`now()` })
    .onConflictDoUpdate({
      target: appUsers.email,
      set: { lastLoginAt: sql`now()`, updatedAt: sql`now()` },
    })
    .returning();

  return user;
}
