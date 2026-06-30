import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL environment variable is not set");
}

const connectionString = databaseUrl;

const chatbotTables = [
  "app_users",
  "auth_verification_tokens",
  "chat_sessions",
  "chat_messages",
  "query_audit",
  "query_feedback",
  "quick_actions",
  "ai_reports",
  "ai_report_executions",
  "schema_objects",
  "schema_embeddings",
  "app_settings",
] as const;

const publicErpTables = [
  "kontrahenci",
  "towary",
  "faktury_sprzedazy",
  "faktury_sprzedazy_pozycje",
  "faktury_zakupu",
  "faktury_zakupu_pozycje",
  "zamowienia_dostawcy",
  "zamowienia_dostawcy_pozycje",
  "dokumenty_powiazane",
] as const;

const requiredSettings = [
  "monthly_ai_token_limit",
  "monthly_ai_token_warning_percent",
] as const;

async function main() {
  const sql = postgres(connectionString, { connect_timeout: 60 });
  const failures: string[] = [];

  try {
    const [schema] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.schemata
        WHERE schema_name = 'chatbot'
      ) AS "exists"
    `;

    if (!schema?.exists) {
      failures.push("Missing schema: chatbot");
    }

    const chatbotRows = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'chatbot'
        AND table_name = ANY(${chatbotTables})
    `;
    const foundChatbotTables = new Set(chatbotRows.map((row) => row.table_name));

    for (const tableName of chatbotTables) {
      if (!foundChatbotTables.has(tableName)) {
        failures.push(`Missing chatbot table: chatbot.${tableName}`);
      }
    }

    const publicRows = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(${publicErpTables})
    `;
    const foundPublicTables = new Set(publicRows.map((row) => row.table_name));

    for (const tableName of publicErpTables) {
      if (!foundPublicTables.has(tableName)) {
        failures.push(`Missing ERP table: public.${tableName}`);
      }
    }

    const extensionRows = await sql<{ extname: string }[]>`
      SELECT extname
      FROM pg_extension
      WHERE extname IN ('pgcrypto', 'vector')
    `;
    const foundExtensions = new Set(extensionRows.map((row) => row.extname));

    for (const extensionName of ["pgcrypto", "vector"]) {
      if (!foundExtensions.has(extensionName)) {
        failures.push(`Missing extension: ${extensionName}`);
      }
    }

    const [embeddingIndex] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'chatbot'
          AND tablename = 'schema_embeddings'
          AND indexname = 'schema_embeddings_embedding_hnsw_idx'
      ) AS "exists"
    `;

    if (!embeddingIndex?.exists) {
      failures.push("Missing index: chatbot.schema_embeddings_embedding_hnsw_idx");
    }

    if (foundChatbotTables.has("app_settings")) {
      const settingsRows = await sql<{ key: string }[]>`
        SELECT key
        FROM chatbot.app_settings
        WHERE key = ANY(${requiredSettings})
      `;
      const foundSettings = new Set(settingsRows.map((row) => row.key));

      for (const settingKey of requiredSettings) {
        if (!foundSettings.has(settingKey)) {
          failures.push(`Missing app setting: ${settingKey}`);
        }
      }
    } else {
      for (const settingKey of requiredSettings) {
        failures.push(`Missing app setting: ${settingKey}`);
      }
    }

    if (failures.length > 0) {
      console.error("Database verification failed:");
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log("Database verification passed.");
    console.log(`Verified ${chatbotTables.length} chatbot tables.`);
    console.log(`Verified ${publicErpTables.length} public ERP tables.`);
    console.log("Verified pgcrypto, vector, HNSW index, and app settings.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Database verification failed with an unexpected error:");
  console.error(error);
  process.exit(1);
});
