CREATE TABLE IF NOT EXISTS "revoked_screen_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"screen_name" text NOT NULL,
	"reason" text NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "revoked_screen_tokens" ADD CONSTRAINT "revoked_screen_tokens_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revoked_screen_tokens_school_idx" ON "revoked_screen_tokens" USING btree ("school_id");
