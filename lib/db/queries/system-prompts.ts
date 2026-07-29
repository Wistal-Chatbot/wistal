import "server-only";

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { appUsers, systemPrompts, type SystemPrompt } from "@/lib/db/schema";

/**
 * The live row for every key that has one — i.e. the highest `version` per
 * `key` (`DISTINCT ON`). Keys never edited since deploy simply aren't returned;
 * callers fall back to the compiled-in default.
 */
export async function getActivePrompts(): Promise<SystemPrompt[]> {
  return db
    .selectDistinctOn([systemPrompts.key])
    .from(systemPrompts)
    .orderBy(systemPrompts.key, desc(systemPrompts.version));
}

/** A stored prompt plus the email of whoever saved it (null if seeded/deleted). */
export type SystemPromptWithAuthor = SystemPrompt & {
  createdByEmail: string | null;
};

/**
 * Like `getActivePrompts`, but joined to `app_users` for the admin panel. Kept
 * separate so the hot chat path doesn't pay for a join it never displays.
 */
export async function getActivePromptsForAdmin(): Promise<
  SystemPromptWithAuthor[]
> {
  return db
    .selectDistinctOn([systemPrompts.key], {
      id: systemPrompts.id,
      key: systemPrompts.key,
      content: systemPrompts.content,
      version: systemPrompts.version,
      createdBy: systemPrompts.createdBy,
      createdAt: systemPrompts.createdAt,
      createdByEmail: appUsers.email,
    })
    .from(systemPrompts)
    .leftJoin(appUsers, eq(systemPrompts.createdBy, appUsers.id))
    .orderBy(systemPrompts.key, desc(systemPrompts.version));
}

/** Full history for one key, newest first, with editor emails. */
export async function listPromptVersions(
  key: string,
): Promise<SystemPromptWithAuthor[]> {
  return db
    .select({
      id: systemPrompts.id,
      key: systemPrompts.key,
      content: systemPrompts.content,
      version: systemPrompts.version,
      createdBy: systemPrompts.createdBy,
      createdAt: systemPrompts.createdAt,
      createdByEmail: appUsers.email,
    })
    .from(systemPrompts)
    .leftJoin(appUsers, eq(systemPrompts.createdBy, appUsers.id))
    .where(eq(systemPrompts.key, key))
    .orderBy(desc(systemPrompts.version));
}

/**
 * Appends a new version for `key`, becoming the live one.
 *
 * The version number is computed inside the INSERT (`MAX(version) + 1` over the
 * same key) rather than read-then-write, so two concurrent saves can't both
 * land on the same number. If they race anyway, the `(key, version)` unique
 * constraint rejects the loser with a 23505 for the caller to surface.
 */
export async function createPromptVersion(
  key: string,
  content: string,
  createdBy: string | null,
): Promise<SystemPrompt> {
  const [row] = await db
    .insert(systemPrompts)
    .values({
      key,
      content,
      createdBy,
      version: sql<number>`(
        SELECT COALESCE(MAX(${systemPrompts.version}), 0) + 1
        FROM ${systemPrompts}
        WHERE ${systemPrompts.key} = ${key}
      )`,
    })
    .returning();

  if (!row) {
    throw new Error("Prompt version insert returned no row");
  }

  return row;
}
