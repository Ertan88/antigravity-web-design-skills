CREATE TABLE IF NOT EXISTS "exam_reminder_acks" (
	"token" text NOT NULL,
	"exam_id" uuid NOT NULL,
	"notify_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_reminder_acks_token_exam_id_pk" PRIMARY KEY("token","exam_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exam_reminders_sent" (
	"exam_id" uuid NOT NULL,
	"notify_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_reminders_sent_exam_id_notify_at_pk" PRIMARY KEY("exam_id","notify_at")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_reminder_acks" ADD CONSTRAINT "exam_reminder_acks_exam_id_exam_schedule_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam_schedule"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exam_reminders_sent" ADD CONSTRAINT "exam_reminders_sent_exam_id_exam_schedule_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam_schedule"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
