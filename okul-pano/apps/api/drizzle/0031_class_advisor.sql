ALTER TABLE "class_groups" ADD COLUMN IF NOT EXISTS "advisor_teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_advisor_teacher_id_teachers_id_fk" FOREIGN KEY ("advisor_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
