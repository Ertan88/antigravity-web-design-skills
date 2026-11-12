CREATE TABLE IF NOT EXISTS "internship_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internship_periods" ADD CONSTRAINT "internship_periods_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internship_periods" ADD CONSTRAINT "internship_periods_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "internship_periods" ADD CONSTRAINT "internship_periods_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "internship_periods_student_idx" ON "internship_periods" USING btree ("student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "internship_periods_business_idx" ON "internship_periods" USING btree ("business_id");
--> statement-breakpoint
INSERT INTO "internship_periods" ("school_id", "student_id", "business_id")
SELECT s."school_id", s."id", s."business_id" FROM "students" s
WHERE s."business_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "internship_periods" p WHERE p."student_id" = s."id");
