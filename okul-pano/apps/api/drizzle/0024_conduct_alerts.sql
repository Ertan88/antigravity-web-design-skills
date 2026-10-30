CREATE TABLE IF NOT EXISTS "conduct_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
	"minus_count" integer NOT NULL,
	"window_days" integer NOT NULL,
	"summary" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"resolved_by_name" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conduct_alerts_school_idx" ON "conduct_alerts" ("school_id","resolved_at");
