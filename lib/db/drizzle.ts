import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL environment variable is not set");
}

export const client = postgres(databaseUrl, {
  connect_timeout: 60,
});

export const db = drizzle(client, { schema });
