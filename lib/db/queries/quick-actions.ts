import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import {
  quickActions,
  type NewQuickAction,
  type QuickAction,
} from "@/lib/db/schema";

/** All enabled quick actions for the chat UI, in display order. */
export async function getEnabledQuickActions(): Promise<QuickAction[]> {
  return db
    .select()
    .from(quickActions)
    .where(eq(quickActions.isEnabled, true))
    .orderBy(asc(quickActions.displayOrder), asc(quickActions.id));
}

/** A single quick action by its unique `key`, or `null` if none exists. */
export async function getQuickActionByKey(
  key: string,
): Promise<QuickAction | null> {
  const [action] = await db
    .select()
    .from(quickActions)
    .where(eq(quickActions.key, key))
    .limit(1);

  return action ?? null;
}

// ── Admin CRUD ───────────────────────────────────────────────────────────────

/** Every quick action (enabled or not) for the admin table, in display order. */
export async function listAllQuickActions(): Promise<QuickAction[]> {
  return db
    .select()
    .from(quickActions)
    .orderBy(asc(quickActions.displayOrder), asc(quickActions.id));
}

/** Inserts a quick action and returns the created row. */
export async function createQuickAction(
  input: NewQuickAction,
): Promise<QuickAction> {
  const [row] = await db.insert(quickActions).values(input).returning();
  return row;
}

/** Updates a quick action by id; returns the updated row or `null` if absent. */
export async function updateQuickAction(
  id: number,
  patch: Partial<NewQuickAction>,
): Promise<QuickAction | null> {
  const [row] = await db
    .update(quickActions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(quickActions.id, id))
    .returning();

  return row ?? null;
}

/** Deletes a quick action by id; returns whether a row was removed. */
export async function deleteQuickAction(id: number): Promise<boolean> {
  const rows = await db
    .delete(quickActions)
    .where(eq(quickActions.id, id))
    .returning({ id: quickActions.id });

  return rows.length > 0;
}
