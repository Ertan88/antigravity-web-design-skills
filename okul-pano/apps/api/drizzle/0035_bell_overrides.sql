ALTER TABLE "bell_schedules" ADD COLUMN IF NOT EXISTS "class_ids" jsonb;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bell_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"date" date NOT NULL,
	"target" text NOT NULL,
	"periods" jsonb NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "bell_overrides" ADD CONSTRAINT "bell_overrides_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bell_overrides" ADD CONSTRAINT "bell_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bell_overrides_school_date_target_uq" ON "bell_overrides" USING btree ("school_id","date","target");
