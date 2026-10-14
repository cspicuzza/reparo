-- Custom migration (hand-written), Model fix / OD-33. Pairs with 0003_model_fix_jobs:
--   1. updated_at trigger and RLS (on, no policies) for the three new tables, as for every table.
--   2. Seed the six categories and put every item under one (Linear *Data model* doc → Model fix).
--      Items an admin added that aren't in the mapping go to Misc. `items.category_id` stays
--      nullable until OD-34, when the API starts requiring it.
--   3. Add the "Other" item (Misc) for purchases that fit no other item.
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON "categories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER jobs_set_updated_at BEFORE UPDATE ON "jobs" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER job_rooms_set_updated_at BEFORE UPDATE ON "job_rooms" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "categories" ("name", "sort_order") VALUES
  ('Remodel', 10),
  ('Furnishing', 20),
  ('Tech', 30),
  ('Appliances', 40),
  ('Moving', 50),
  ('Misc', 60)
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
INSERT INTO "items" ("name", "sort_order") VALUES ('Other', 900)
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
UPDATE "items" AS i
SET "category_id" = c."id"
FROM (VALUES
  ('Demo', 'Remodel'),
  ('Trim', 'Remodel'),
  ('Paint', 'Remodel'),
  ('Flooring', 'Remodel'),
  ('Electric', 'Remodel'),
  ('Plumbing', 'Remodel'),
  ('Drywall', 'Remodel'),
  ('Windows & Doors', 'Remodel'),
  ('Stucco', 'Remodel'),
  ('Fireplace', 'Remodel'),
  ('Bathroom Remodel', 'Remodel'),
  ('Project Fee', 'Remodel'),
  ('Furniture', 'Furnishing'),
  ('Rugs', 'Furnishing'),
  ('Decor', 'Furnishing'),
  ('Lighting', 'Furnishing'),
  ('Ceiling Fans', 'Furnishing'),
  ('Window Treatments', 'Furnishing'),
  ('Wallpaper', 'Furnishing'),
  ('Wall Paneling', 'Furnishing'),
  ('TV & Tech', 'Tech'),
  ('Network & Security', 'Tech'),
  ('Appliances', 'Appliances'),
  ('Other', 'Misc')
) AS m("item", "category")
JOIN "categories" AS c ON c."name" = m."category"
WHERE i."name" = m."item" AND i."category_id" IS NULL;--> statement-breakpoint
UPDATE "items"
SET "category_id" = (SELECT "id" FROM "categories" WHERE "name" = 'Misc')
WHERE "category_id" IS NULL;
