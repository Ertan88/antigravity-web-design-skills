ALTER TABLE "teacher_branches" ADD COLUMN IF NOT EXISTS "vocational" boolean;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "area_id" uuid;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_area_id_teacher_branches_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."teacher_branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "created_by" uuid;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internship_marks" ADD COLUMN IF NOT EXISTS "notified_at" timestamp with time zone;--> statement-breakpoint
UPDATE "internship_marks" SET "notified_at" = now() WHERE "notified_at" IS NULL;
