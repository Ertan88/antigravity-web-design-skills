-- Başarı / ayın öğrencisi: panodaki Başarılar kartında ve duyuru alanında ayrı ayrı gösterilebilir
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "show_card" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "achievements" ADD COLUMN IF NOT EXISTS "show_slide" boolean DEFAULT true NOT NULL;
