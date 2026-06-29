CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "vector";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "chatbot";
--> statement-breakpoint
CREATE TABLE "chatbot"."ai_report_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" uuid,
	"input_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_data" jsonb,
	"sql_queries" text[],
	"tokens_used" integer,
	"execution_ms" integer,
	"status" text DEFAULT 'completed' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_report_executions_status_check" CHECK ("chatbot"."ai_report_executions"."status" IN ('completed', 'failed', 'timeout'))
);
--> statement-breakpoint
CREATE TABLE "chatbot"."ai_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"output_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"html_widget" text,
	"input_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot"."quick_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name_pl" text NOT NULL,
	"description_pl" text,
	"category" text,
	"prompt_template" text NOT NULL,
	"custom_input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uses_database" boolean DEFAULT false NOT NULL,
	"uses_web_search" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quick_actions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "chatbot"."query_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chat_session_id" uuid,
	"message_id" bigint,
	"user_id" uuid,
	"source" text DEFAULT 'chatbot' NOT NULL,
	"user_input" text,
	"sql_generated" text,
	"sql_executed" text,
	"sql_valid" boolean DEFAULT false NOT NULL,
	"validation_error" text,
	"tables_used" text[] DEFAULT '{}'::text[] NOT NULL,
	"row_count" integer,
	"execution_ms" integer,
	"llm_model" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "query_audit_source_check" CHECK ("chatbot"."query_audit"."source" IN ('chatbot', 'manual_browser', 'quick_action', 'ai_report'))
);
--> statement-breakpoint
CREATE TABLE "chatbot"."query_feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query_audit_id" bigint,
	"message_id" bigint,
	"user_id" uuid,
	"comment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot"."chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chat_session_id" uuid NOT NULL,
	"user_id" uuid,
	"message_type" text NOT NULL,
	"content" text NOT NULL,
	"sql_generated" text,
	"row_count" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_message_type_check" CHECK ("chatbot"."chat_messages"."message_type" IN ('user', 'assistant', 'tool', 'system'))
);
--> statement-breakpoint
CREATE TABLE "chatbot"."chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"web_search_enabled" boolean DEFAULT false NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone,
	CONSTRAINT "chat_sessions_status_check" CHECK ("chatbot"."chat_sessions"."status" IN ('active', 'completed', 'failed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "chatbot"."schema_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"schema_object_id" integer NOT NULL,
	"source_text" text NOT NULL,
	"embedding" vector(1536),
	"embedding_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot"."schema_objects" (
	"id" serial PRIMARY KEY NOT NULL,
	"object_type" text NOT NULL,
	"schema_name" text DEFAULT 'public' NOT NULL,
	"table_name" text NOT NULL,
	"column_name" text,
	"related_table_name" text,
	"related_column_name" text,
	"description_pl" text NOT NULL,
	"business_terms" text[] DEFAULT '{}'::text[] NOT NULL,
	"sample_questions" text[] DEFAULT '{}'::text[] NOT NULL,
	"example_sql" text,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schema_objects_object_type_check" CHECK ("chatbot"."schema_objects"."object_type" IN ('table', 'column', 'relationship'))
);
--> statement-breakpoint
CREATE TABLE "chatbot"."app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatbot"."app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_email_unique" UNIQUE("email"),
	CONSTRAINT "app_users_wistal_email_check" CHECK (lower("chatbot"."app_users"."email") LIKE '%@wistal.com.pl')
);
--> statement-breakpoint
CREATE TABLE "chatbot"."auth_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_wistal_email_check" CHECK (lower("chatbot"."auth_verification_tokens"."email") LIKE '%@wistal.com.pl')
);
--> statement-breakpoint
ALTER TABLE "chatbot"."ai_report_executions" ADD CONSTRAINT "ai_report_executions_report_id_ai_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "chatbot"."ai_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."ai_report_executions" ADD CONSTRAINT "ai_report_executions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "chatbot"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."ai_reports" ADD CONSTRAINT "ai_reports_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "chatbot"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."quick_actions" ADD CONSTRAINT "quick_actions_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "chatbot"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."query_audit" ADD CONSTRAINT "query_audit_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "chatbot"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."query_audit" ADD CONSTRAINT "query_audit_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "chatbot"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."query_audit" ADD CONSTRAINT "query_audit_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "chatbot"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."query_feedback" ADD CONSTRAINT "query_feedback_query_audit_id_query_audit_id_fk" FOREIGN KEY ("query_audit_id") REFERENCES "chatbot"."query_audit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."query_feedback" ADD CONSTRAINT "query_feedback_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "chatbot"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."query_feedback" ADD CONSTRAINT "query_feedback_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "chatbot"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."chat_messages" ADD CONSTRAINT "chat_messages_chat_session_id_chat_sessions_id_fk" FOREIGN KEY ("chat_session_id") REFERENCES "chatbot"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."chat_messages" ADD CONSTRAINT "chat_messages_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "chatbot"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "chatbot"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatbot"."schema_embeddings" ADD CONSTRAINT "schema_embeddings_schema_object_id_schema_objects_id_fk" FOREIGN KEY ("schema_object_id") REFERENCES "chatbot"."schema_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schema_embeddings_embedding_hnsw_idx" ON "chatbot"."schema_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
INSERT INTO "chatbot"."app_settings" ("key", "value", "description")
VALUES
	(
		'monthly_ai_token_limit',
		'{"value": 1000000}'::jsonb,
		'Globalny miesięczny limit tokenów AI dla aplikacji / wszystkich użytkowników.'
	),
	(
		'monthly_ai_token_warning_percent',
		'{"value": 80}'::jsonb,
		'Próg ostrzegawczy procentowego zużycia miesięcznego limitu AI.'
	)
ON CONFLICT ("key") DO UPDATE
SET
	"value" = EXCLUDED."value",
	"description" = EXCLUDED."description",
	"updated_at" = now();
