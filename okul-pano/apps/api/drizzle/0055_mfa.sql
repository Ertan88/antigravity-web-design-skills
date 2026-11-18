ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_pending" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_last_step" integer;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfa_recovery_user_idx" ON "mfa_recovery_codes" ("user_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trusted_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"token_hash" text NOT NULL UNIQUE,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trusted_devices_user_idx" ON "trusted_devices" ("user_id");
