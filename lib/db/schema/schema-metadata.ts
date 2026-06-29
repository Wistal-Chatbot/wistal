import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  serial,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

import { chatbot } from "./shared";

export const schemaObjects = chatbot.table(
  "schema_objects",
  {
    id: serial("id").primaryKey(),
    objectType: text("object_type").notNull(),
    schemaName: text("schema_name").notNull().default("public"),
    tableName: text("table_name").notNull(),
    columnName: text("column_name"),
    relatedTableName: text("related_table_name"),
    relatedColumnName: text("related_column_name"),
    descriptionPl: text("description_pl").notNull(),
    businessTerms: text("business_terms")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sampleQuestions: text("sample_questions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    exampleSql: text("example_sql"),
    isSensitive: boolean("is_sensitive").notNull().default(false),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "schema_objects_object_type_check",
      sql`${table.objectType} IN ('table', 'column', 'relationship')`,
    ),
  ],
);

export const schemaEmbeddings = chatbot.table(
  "schema_embeddings",
  {
    id: serial("id").primaryKey(),
    schemaObjectId: integer("schema_object_id")
      .notNull()
      .references(() => schemaObjects.id, { onDelete: "cascade" }),
    sourceText: text("source_text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    embeddingModel: text("embedding_model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("schema_embeddings_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export type SchemaObject = typeof schemaObjects.$inferSelect;
export type NewSchemaObject = typeof schemaObjects.$inferInsert;
export type SchemaEmbedding = typeof schemaEmbeddings.$inferSelect;
export type NewSchemaEmbedding = typeof schemaEmbeddings.$inferInsert;
