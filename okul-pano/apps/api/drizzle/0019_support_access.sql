-- KVKK: platform yöneticisi okul içeriğine yalnızca okul sahibinin verdiği süreli destek erişimiyle girer
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "support_access_until" timestamp with time zone;--> statement-breakpoint
-- Geçiş: platform yöneticisinin en son açtığı (kendi) okulda okul sahibi üyeliği; böylece kendi okuluna erişimi kesilmez
INSERT INTO "memberships" ("user_id", "school_id", "role", "permissions")
SELECT "id", "last_school_id", 'owner', '[]'::jsonb FROM "users"
WHERE "is_super_admin" = true AND "last_school_id" IS NOT NULL
ON CONFLICT ("user_id", "school_id") DO NOTHING;
