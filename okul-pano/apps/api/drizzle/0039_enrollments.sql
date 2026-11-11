ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "phone" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"teacher_id" uuid,
	"kind" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"step_hash" text,
	"step_expires_at" timestamp with time zone,
	"email" text,
	"email_code_hash" text,
	"email_code_expires_at" timestamp with time zone,
	"email_code_tries" integer DEFAULT 0 NOT NULL,
	"password_hash" text,
	"existing_user_id" uuid,
	"status" text DEFAULT 'waiting' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "join_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "join_links_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_existing_user_id_users_id_fk" FOREIGN KEY ("existing_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "join_links" ADD CONSTRAINT "join_links_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "join_links" ADD CONSTRAINT "join_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_school_idx" ON "enrollments" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_code_idx" ON "enrollments" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollments_step_idx" ON "enrollments" USING btree ("step_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "join_links_school_idx" ON "join_links" USING btree ("school_id");
