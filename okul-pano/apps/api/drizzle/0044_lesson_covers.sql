CREATE TABLE IF NOT EXISTS "lesson_covers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"date" date NOT NULL,
	"period_no" integer NOT NULL,
	"class_group_id" uuid NOT NULL,
	"absent_teacher_id" uuid,
	"teacher_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_covers" ADD CONSTRAINT "lesson_covers_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_covers" ADD CONSTRAINT "lesson_covers_class_group_id_class_groups_id_fk" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_covers" ADD CONSTRAINT "lesson_covers_absent_teacher_id_teachers_id_fk" FOREIGN KEY ("absent_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_covers" ADD CONSTRAINT "lesson_covers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lesson_covers" ADD CONSTRAINT "lesson_covers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lesson_covers_slot_uq" ON "lesson_covers" USING btree ("school_id","date","period_no","class_group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lesson_covers_teacher_idx" ON "lesson_covers" USING btree ("school_id","teacher_id","date");
