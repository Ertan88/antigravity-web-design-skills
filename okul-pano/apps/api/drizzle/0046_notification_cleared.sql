-- Bildirim kutusu "Okunanları temizle": satır silinmez, gizlenir (aynı hatırlatma ikinci kez gönderilmesin)
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "cleared_at" timestamp with time zone;
