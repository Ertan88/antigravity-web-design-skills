-- Ders programı hücresinde birden çok kayıt (bölünmüş sınıf, dal, seçmeli) ve dal / grup adı
ALTER TABLE "timetable_entries" ADD COLUMN IF NOT EXISTS "group_label" text;--> statement-breakpoint
DROP INDEX IF EXISTS "timetable_cell_uq";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timetable_cell_idx" ON "timetable_entries" ("school_id","weekday","period_no","class_group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timetable_teacher_idx" ON "timetable_entries" ("school_id","teacher_id");
