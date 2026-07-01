import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { quickActions, type QuickAction } from "@/lib/db/schema";

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
