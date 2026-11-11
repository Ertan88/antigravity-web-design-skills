ALTER TABLE "bell_schedules" ADD COLUMN IF NOT EXISTS "lesson_count" integer;--> statement-breakpoint
ALTER TABLE "bell_schedules" ADD COLUMN IF NOT EXISTS "shift" text;--> statement-breakpoint
DELETE FROM "bell_schedules" WHERE "source" = 'eokul-extra';--> statement-breakpoint
UPDATE "bell_schedules" SET "weekdays" = '[]'::jsonb, "lesson_count" = jsonb_array_length("periods")
WHERE "id" IN (
  SELECT DISTINCT ON ("school_id") "id" FROM "bell_schedules"
  ORDER BY "school_id", jsonb_array_length("weekdays") DESC, "sort_order" ASC
);--> statement-breakpoint
ALTER TABLE "class_groups" DROP COLUMN IF EXISTS "bell_plan";--> statement-breakpoint
ALTER TABLE "class_groups" ADD COLUMN IF NOT EXISTS "shift" text;
