ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "last_ip" text;--> statement-breakpoint
ALTER TABLE "screens" ADD COLUMN IF NOT EXISTS "ip_alert_at" timestamp with time zone;
