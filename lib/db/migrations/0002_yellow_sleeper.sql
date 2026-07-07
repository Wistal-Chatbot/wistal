ALTER TABLE "chatbot"."ai_report_executions" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "chatbot"."ai_report_executions" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "chatbot"."ai_report_executions" ADD COLUMN "cache_creation_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "chatbot"."ai_report_executions" ADD COLUMN "cache_read_input_tokens" integer;