-- İşletmenin görev günü: koordinatör öğretmen her hafta bu gün işletmeye gider (1 Pazartesi … 5 Cuma)
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "visit_weekday" integer;
