-- Destek erişiminin verildiği an: platform yöneticisine "erişim verildi" bildirimi
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "support_access_granted_at" timestamp with time zone;
