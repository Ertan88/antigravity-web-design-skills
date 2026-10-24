CREATE TABLE "school_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "duties_school_idx";--> statement-breakpoint
-- Mevcut nöbet çizelgesi bu aya atanır (önceden aydan bağımsızdı)
ALTER TABLE "duties" ADD COLUMN "month" text;--> statement-breakpoint
UPDATE "duties" SET "month" = to_char(now() AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM');--> statement-breakpoint
ALTER TABLE "duties" ALTER COLUMN "month" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "school_holidays" ADD CONSTRAINT "school_holidays_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_holidays_school_date_uq" ON "school_holidays" USING btree ("school_id","date");--> statement-breakpoint
CREATE INDEX "duties_school_idx" ON "duties" USING btree ("school_id","month","weekday");