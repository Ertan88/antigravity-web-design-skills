CREATE TABLE IF NOT EXISTS "exam_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"date" date NOT NULL,
	"period_no" integer NOT NULL,
	"class_group_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"kind" text DEFAULT 'written' NOT NULL,
	"proctor_teacher_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "exam_schedule" ADD CONSTRAINT "exam_schedule_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedule" ADD CONSTRAINT "exam_schedule_class_group_id_class_groups_id_fk" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedule" ADD CONSTRAINT "exam_schedule_proctor_teacher_id_teachers_id_fk" FOREIGN KEY ("proctor_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_schedule" ADD CONSTRAINT "exam_schedule_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exam_schedule_slot_uq" ON "exam_schedule" USING btree ("school_id","date","period_no","class_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_schedule_date_idx" ON "exam_schedule" USING btree ("school_id","date");
