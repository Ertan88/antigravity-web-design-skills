CREATE TABLE IF NOT EXISTS "contact_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"school" text NOT NULL,
	"city" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"preferred_time" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_requests_created_idx" ON "contact_requests" USING btree ("created_at");
