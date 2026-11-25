CREATE TABLE IF NOT EXISTS "trial_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"value_hash" text NOT NULL,
	"school_id" uuid REFERENCES "schools"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trial_marks_value_idx" ON "trial_marks" ("kind","value_hash");--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "trial_flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "trial_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signups" ADD COLUMN IF NOT EXISTS "flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "display_pairings" ADD COLUMN IF NOT EXISTS "device_hash" text;
