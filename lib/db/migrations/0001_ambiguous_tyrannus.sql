ALTER TABLE "chatbot"."app_users" DROP CONSTRAINT IF EXISTS "app_users_wistal_email_check";--> statement-breakpoint
ALTER TABLE "chatbot"."auth_verification_tokens" DROP CONSTRAINT IF EXISTS "auth_tokens_wistal_email_check";
