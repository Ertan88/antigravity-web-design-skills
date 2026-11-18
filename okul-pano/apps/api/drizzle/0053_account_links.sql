ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "via_user_id" uuid REFERENCES "users"("id") ON DELETE cascade;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE cascade,
	"school_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
