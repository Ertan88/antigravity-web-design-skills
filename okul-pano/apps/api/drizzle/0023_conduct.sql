-- Öğrenci okul numarası: zorunlu ve okul içinde benzersiz. Var olan öğrencilere okul içinde ad sırasıyla geçici
-- numara verilir (1, 2, 3…); okul gerçek numaraları Excel'den aktararak ya da elle güncelleyebilir.
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "school_no" text;--> statement-breakpoint
UPDATE "students" s SET "school_no" = t.n::text
FROM (SELECT "id", row_number() OVER (PARTITION BY "school_id" ORDER BY "full_name", "id") AS n FROM "students" WHERE "school_no" IS NULL) t
WHERE s."id" = t."id";--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "school_no" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "students_school_no_uq" ON "students" ("school_id","school_no");--> statement-breakpoint
-- Sınıfın okul düzeyi (ilkokul / ortaokul / lise); boşsa sınıf adından anlaşılır
ALTER TABLE "class_groups" ADD COLUMN IF NOT EXISTS "level" text;--> statement-breakpoint
-- Gözlem kriterleri (düzeye göre ayrı şablon)
CREATE TABLE IF NOT EXISTS "conduct_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE cascade,
	"level" text NOT NULL,
	"group" text NOT NULL,
	"label" text NOT NULL,
	"points" integer NOT NULL,
	"note_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conduct_criteria_school_idx" ON "conduct_criteria" ("school_id","level");--> statement-breakpoint
-- Gözlem kayıtları (kriter adı ve puanı kayıt anındaki hâliyle saklanır)
CREATE TABLE IF NOT EXISTS "conduct_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE cascade,
	"student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
	"criterion_id" uuid REFERENCES "conduct_criteria"("id") ON DELETE set null,
	"group" text NOT NULL,
	"label" text NOT NULL,
	"points" integer NOT NULL,
	"note" text,
	"user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"user_name" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conduct_entries_student_idx" ON "conduct_entries" ("student_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conduct_entries_school_idx" ON "conduct_entries" ("school_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conduct_entries_batch_idx" ON "conduct_entries" ("batch_id");--> statement-breakpoint
-- Ayın öğrencisi seçimleri
CREATE TABLE IF NOT EXISTS "conduct_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE cascade,
	"month" text NOT NULL,
	"student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE cascade,
	"achievement_id" uuid REFERENCES "achievements"("id") ON DELETE set null,
	"selected_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conduct_awards_uq" ON "conduct_awards" ("school_id","month","student_id");
