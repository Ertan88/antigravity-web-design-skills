-- İlk girişte "örnek verilerle başla" sorusu ve eklenen örnek kayıtların listesi (sonradan temizlemek için)
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "onboarding" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "sample_data" jsonb;
