ALTER TABLE "chatbot"."chat_messages" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "chatbot"."chat_messages" ADD COLUMN "error_detail" text;--> statement-breakpoint
ALTER TABLE "chatbot"."chat_messages" ADD COLUMN "retryable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chatbot"."chat_messages" ADD COLUMN "is_retried" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chatbot"."chat_messages" ADD COLUMN "retry_of_message_id" bigint;