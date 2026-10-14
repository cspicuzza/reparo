ALTER TYPE "public"."file_kind" ADD VALUE 'rendering';--> statement-breakpoint
ALTER TYPE "public"."file_kind" ADD VALUE 'inspiration';--> statement-breakpoint
ALTER TYPE "public"."file_kind" ADD VALUE 'progress_photo';--> statement-breakpoint
ALTER TYPE "public"."file_kind" ADD VALUE 'product_image';--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "job_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"status" "work_status" DEFAULT 'unstarted' NOT NULL,
	"spec" text,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phase_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"spec" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" "work_status" DEFAULT 'unstarted' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "owner_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."file_owner_type";--> statement-breakpoint
CREATE TYPE "public"."file_owner_type" AS ENUM('job', 'cost', 'vendor', 'quote', 'room', 'purchase');--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "owner_type" SET DATA TYPE "public"."file_owner_type" USING "owner_type"::"public"."file_owner_type";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "job_rooms" ADD CONSTRAINT "job_rooms_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_rooms" ADD CONSTRAINT "job_rooms_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_rooms_job_room_live_uidx" ON "job_rooms" USING btree ("job_id","room_id") WHERE "job_rooms"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "job_rooms_room_idx" ON "job_rooms" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "jobs_phase_idx" ON "jobs" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "jobs_item_idx" ON "jobs" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;