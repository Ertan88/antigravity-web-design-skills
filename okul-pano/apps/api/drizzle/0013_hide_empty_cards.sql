-- Boş kartlar artık varsayılan olarak panoda görünmez; daha önce kaydedilmiş ayar da kapatılır
UPDATE "schools" SET "settings" = jsonb_set("settings", '{showEmptyCards}', 'false'::jsonb) WHERE "settings" ? 'showEmptyCards';
