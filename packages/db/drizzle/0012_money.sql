CREATE TYPE "public"."shopping_status" AS ENUM('to_buy', 'purchased', 'returned');--> statement-breakpoint
CREATE TABLE "budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"starting_cents" bigint DEFAULT 0 NOT NULL,
	"as_of" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_singleton_ck" CHECK ("budget"."singleton")
);
--> statement-breakpoint
CREATE TABLE "budget_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount_cents" bigint NOT NULL,
	"on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "cost_lines_amount_ck" CHECK ("cost_lines"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "payments_amount_ck" CHECK ("payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "shopping_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"room_id" uuid,
	"category_id" uuid NOT NULL,
	"job_id" uuid,
	"name" text NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"store" text DEFAULT '' NOT NULL,
	"model_number" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"price_cents" bigint DEFAULT 0 NOT NULL,
	"paid_cents" bigint,
	"refund_cents" bigint,
	"status" "shopping_status" DEFAULT 'to_buy' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "shopping_lines_amounts_ck" CHECK ("shopping_lines"."price_cents" >= 0 AND "shopping_lines"."paid_cents" >= 0 AND "shopping_lines"."refund_cents" >= 0),
	CONSTRAINT "shopping_lines_quantity_ck" CHECK ("shopping_lines"."quantity" >= 1),
	CONSTRAINT "shopping_lines_refund_ck" CHECK ("shopping_lines"."refund_cents" <= "shopping_lines"."paid_cents"),
	CONSTRAINT "shopping_lines_status_ck" CHECK (("shopping_lines"."status" = 'to_buy' AND "shopping_lines"."paid_cents" IS NULL AND "shopping_lines"."refund_cents" IS NULL)
        OR ("shopping_lines"."status" = 'purchased' AND "shopping_lines"."paid_cents" IS NOT NULL AND "shopping_lines"."refund_cents" IS NULL)
        OR ("shopping_lines"."status" = 'returned' AND "shopping_lines"."paid_cents" IS NOT NULL AND "shopping_lines"."refund_cents" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_name_unique";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cost_lines" ADD CONSTRAINT "cost_lines_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lines" ADD CONSTRAINT "shopping_lines_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lines" ADD CONSTRAINT "shopping_lines_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lines" ADD CONSTRAINT "shopping_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lines" ADD CONSTRAINT "shopping_lines_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_singleton_uidx" ON "budget" USING btree ("singleton");--> statement-breakpoint
CREATE INDEX "cost_lines_job_idx" ON "cost_lines" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "payments_job_idx" ON "payments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "shopping_lines_phase_idx" ON "shopping_lines" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "shopping_lines_room_idx" ON "shopping_lines" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "shopping_lines_category_idx" ON "shopping_lines" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "shopping_lines_job_idx" ON "shopping_lines" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_live_uidx" ON "categories" USING btree (lower("name")) WHERE "categories"."deleted_at" IS NULL;