CREATE TABLE IF NOT EXISTS "login_failures" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"first_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone
);
