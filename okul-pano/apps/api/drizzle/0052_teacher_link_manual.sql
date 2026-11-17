ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "teacher_link_manual" boolean DEFAULT false NOT NULL;
