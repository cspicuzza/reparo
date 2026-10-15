CREATE TYPE "public"."estimate_status" AS ENUM('requested', 'received', 'chosen', 'declined');--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"amount_cents" bigint,
	"received_on" date,
	"valid_until" date,
	"status" "estimate_status" DEFAULT 'received' NOT NULL,
	"declined_from" "estimate_status",
	"cost_line_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "estimates_amount_ck" CHECK ("estimates"."amount_cents" >= 0),
	CONSTRAINT "estimates_amount_needed_ck" CHECK ("estimates"."status" NOT IN ('received', 'chosen') OR "estimates"."amount_cents" IS NOT NULL),
	CONSTRAINT "estimates_chosen_line_ck" CHECK (("estimates"."status" = 'chosen') = ("estimates"."cost_line_id" IS NOT NULL)),
	CONSTRAINT "estimates_declined_from_ck" CHECK ("estimates"."declined_from" IS NULL OR ("estimates"."status" = 'declined' AND "estimates"."declined_from" IN ('requested', 'received')))
);
--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_cost_line_id_cost_lines_id_fk" FOREIGN KEY ("cost_line_id") REFERENCES "public"."cost_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "estimates_job_idx" ON "estimates" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "estimates_vendor_idx" ON "estimates" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_one_chosen_uidx" ON "estimates" USING btree ("job_id") WHERE "estimates"."status" = 'chosen' AND "estimates"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_cost_line_uidx" ON "estimates" USING btree ("cost_line_id") WHERE "estimates"."cost_line_id" IS NOT NULL AND "estimates"."deleted_at" IS NULL;