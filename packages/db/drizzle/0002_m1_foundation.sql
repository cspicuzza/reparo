CREATE TYPE "public"."phase_status" AS ENUM('planned', 'active', 'complete');--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('unstarted', 'in_progress', 'awaiting_review', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "phase_status" DEFAULT 'planned' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"length_in" numeric(10, 4),
	"width_in" numeric(10, 4),
	"ceiling_height_in" numeric(10, 4),
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"room_id" uuid,
	"phase_id" uuid NOT NULL,
	"status" "work_status" DEFAULT 'unstarted' NOT NULL,
	"spec" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "phases_name_live_uidx" ON "phases" USING btree ("name") WHERE "phases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_name_live_uidx" ON "rooms" USING btree ("name") WHERE "rooms"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "work_items_item_room_live_uidx" ON "work_items" USING btree ("item_id","room_id") WHERE "work_items"."deleted_at" IS NULL AND "work_items"."room_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "work_items_item_default_live_uidx" ON "work_items" USING btree ("item_id") WHERE "work_items"."deleted_at" IS NULL AND "work_items"."room_id" IS NULL;--> statement-breakpoint
CREATE INDEX "work_items_phase_idx" ON "work_items" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "work_items_room_idx" ON "work_items" USING btree ("room_id");--> statement-breakpoint
-- Hand-written from here (same pattern as 0001): every new table gets the updated_at trigger
-- and RLS on with no policies, then the M1 seed. Chris confirmed the starter list 2026-10-13.
CREATE TRIGGER phases_set_updated_at BEFORE UPDATE ON "phases" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER rooms_set_updated_at BEFORE UPDATE ON "rooms" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER items_set_updated_at BEFORE UPDATE ON "items" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER work_items_set_updated_at BEFORE UPDATE ON "work_items" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "phases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Seed: Phase 1 is the spreadsheet's Required + Phase 1 tiers plus the move (docs/scope.md).
INSERT INTO "phases" ("name", "sort_order", "status")
VALUES ('Phase 1', 1, 'active')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Seed: starter item catalog. Remodel kinds from the spreadsheet's Remodel sheet, then the
-- furnishing kinds the Furniture/Misc/Appliances sheets group purchases under. Admin-managed after this.
INSERT INTO "items" ("name", "sort_order") VALUES
  ('Demo', 10),
  ('Trim', 20),
  ('Paint', 30),
  ('Flooring', 40),
  ('Electric', 50),
  ('Plumbing', 60),
  ('Drywall', 70),
  ('Windows & Doors', 80),
  ('Stucco', 90),
  ('Fireplace', 100),
  ('Bathroom Remodel', 110),
  ('Project Fee', 120),
  ('Furniture', 200),
  ('Rugs', 210),
  ('Decor', 220),
  ('Lighting', 230),
  ('Ceiling Fans', 240),
  ('Window Treatments', 250),
  ('Wallpaper', 260),
  ('Wall Paneling', 270),
  ('TV & Tech', 280),
  ('Network & Security', 290),
  ('Appliances', 300)
ON CONFLICT ("name") DO NOTHING;
