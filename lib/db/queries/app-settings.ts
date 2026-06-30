import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";

/** Reads a single `chatbot.app_settings` value (JSONB) by key, or null. */
export async function getAppSetting<T = unknown>(
  key: string,
): Promise<T | null> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  return row ? (row.value as T) : null;
}
