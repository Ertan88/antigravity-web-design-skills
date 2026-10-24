CREATE TABLE "teacher_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_titles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "title_id" uuid;--> statement-breakpoint
ALTER TABLE "teacher_branches" ADD CONSTRAINT "teacher_branches_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_titles" ADD CONSTRAINT "teacher_titles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_branches_school_name_uq" ON "teacher_branches" USING btree ("school_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_titles_school_name_uq" ON "teacher_titles" USING btree ("school_id","name");--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_branch_id_teacher_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."teacher_branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_title_id_teacher_titles_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."teacher_titles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Veri taşıma: eski serbest metin branşları okul bazında listeye dönüştür ve öğretmenleri bağla
INSERT INTO "teacher_branches" ("school_id", "name")
SELECT DISTINCT "school_id", btrim("branch") FROM "teachers"
WHERE "branch" IS NOT NULL AND btrim("branch") <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "teachers" AS t SET "branch_id" = b."id"
FROM "teacher_branches" AS b
WHERE b."school_id" = t."school_id" AND b."name" = btrim(t."branch");
