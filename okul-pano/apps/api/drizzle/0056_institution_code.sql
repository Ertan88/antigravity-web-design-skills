ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "institution_code" text;--> statement-breakpoint
ALTER TABLE "signups" ADD COLUMN IF NOT EXISTS "institution_code" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schools_institution_code_idx" ON "schools" ("institution_code");
