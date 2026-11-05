ALTER TABLE "bell_schedules" ADD COLUMN IF NOT EXISTS "grades" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "bell_schedules" ADD COLUMN IF NOT EXISTS "class_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
