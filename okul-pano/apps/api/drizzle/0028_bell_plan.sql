ALTER TABLE "bell_schedules" DROP COLUMN IF EXISTS "grades";--> statement-breakpoint
ALTER TABLE "bell_schedules" DROP COLUMN IF EXISTS "class_ids";--> statement-breakpoint
ALTER TABLE "bell_schedules" ADD COLUMN IF NOT EXISTS "source" text;--> statement-breakpoint
ALTER TABLE "class_groups" ADD COLUMN IF NOT EXISTS "bell_plan" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "class_groups" ADD COLUMN IF NOT EXISTS "bell_exempt" boolean DEFAULT false NOT NULL;
