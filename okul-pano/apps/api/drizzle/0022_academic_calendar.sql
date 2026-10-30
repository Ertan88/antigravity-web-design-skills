-- MEB eğitim ve öğretim yılı çalışma takvimi (bütün okullar için ortak); sunucu her yıl haziran ortasından itibaren tarar
CREATE TABLE IF NOT EXISTS "academic_calendars" (
	"start_year" integer PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"pending" jsonb,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
-- Kurulumla gelen takvimler (MEB duyuruları; 2026-2027: 13 Haziran 2026, 2026/68 sayılı genelge). Tarama bulunca doğrular.
INSERT INTO "academic_calendars" ("start_year", "data", "source", "source_url") VALUES
(2025, '{"lessonsStart": "2025-09-08", "term1End": "2026-01-16", "term2Start": "2026-02-02", "lessonsEnd": "2026-06-26", "breaks": [{"name": "Birinci Dönem Ara Tatili", "start": "2025-11-10", "end": "2025-11-14"}, {"name": "İkinci Dönem Ara Tatili", "start": "2026-03-16", "end": "2026-03-20"}]}'::jsonb, 'builtin', NULL),
(2026, '{"lessonsStart": "2026-09-14", "term1End": "2027-01-22", "term2Start": "2027-02-08", "lessonsEnd": "2027-06-25", "breaks": [{"name": "Birinci Dönem Ara Tatili", "start": "2026-11-16", "end": "2026-11-20"}, {"name": "İkinci Dönem Ara Tatili", "start": "2027-03-08", "end": "2027-03-12"}]}'::jsonb, 'builtin', 'https://www.meb.gov.tr/20262027egitimogretimyilitakvimiaciklandi/haber/41057/tr')
ON CONFLICT ("start_year") DO NOTHING;
