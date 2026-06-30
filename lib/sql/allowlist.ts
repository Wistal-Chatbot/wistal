import "server-only";

import { client } from "@/lib/db/drizzle";

/**
 * Dynamic read allowlist: every BASE TABLE in the `public` schema. Adding a new
 * ERP table or column to `public` makes it queryable automatically — no code
 * change. The `chatbot` schema (app data, OTP tokens, users) and system schemas
 * are never in this set, so the SQL validator rejects any reference to them.
 *
 * Cached in-memory with a short TTL so we don't hit `information_schema` on every
 * request; call `clearPublicTableAllowlistCache()` after a migration in dev.
 */

const TTL_MS = 5 * 60 * 1000;

let cache: { tables: Set<string>; at: number } | null = null;

export async function getPublicTableAllowlist(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.tables;
  }

  const rows = await client<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `;

  const tables = new Set(rows.map((row) => row.table_name.toLowerCase()));
  cache = { tables, at: Date.now() };
  return tables;
}

export function clearPublicTableAllowlistCache(): void {
  cache = null;
}
