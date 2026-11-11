ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "promotion_requested_by" uuid;
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "promotion_requested_at" timestamp with time zone;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memberships" ADD CONSTRAINT "memberships_promotion_requested_by_users_id_fk" FOREIGN KEY ("promotion_requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
