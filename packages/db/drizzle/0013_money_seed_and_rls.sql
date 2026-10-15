-- Custom migration (hand-written), M3 / OD-49. Pairs with 0012_money:
--   1. updated_at triggers and RLS (on, no policies) for the five new tables, as for every table.
--   2. Reshape categories into the shopping categories (Linear *Data model* doc → M3). The six
--      Model fix categories grouped items, which OD-44 removed, so nothing points at them; they
--      are deleted and the shopping list's categories seeded. Categories an admin may have added
--      are kept.
--   3. The one budget row, empty until the pool is entered (OD-36 imports $300,000 as of 9/3).
CREATE TRIGGER shopping_lines_set_updated_at BEFORE UPDATE ON "shopping_lines" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER cost_lines_set_updated_at BEFORE UPDATE ON "cost_lines" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON "payments" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER budget_set_updated_at BEFORE UPDATE ON "budget" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER budget_adjustments_set_updated_at BEFORE UPDATE ON "budget_adjustments" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "shopping_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budget" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budget_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DELETE FROM "categories"
WHERE "name" IN ('Remodel', 'Furnishing', 'Tech', 'Appliances', 'Moving', 'Misc');--> statement-breakpoint
INSERT INTO "categories" ("name", "sort_order") VALUES
  ('Furniture', 10),
  ('Rugs', 20),
  ('Decor', 30),
  ('Lighting', 40),
  ('Ceiling fans', 50),
  ('Window treatments', 60),
  ('Wallpaper & paneling', 70),
  ('TV & tech', 80),
  ('Network & security', 90),
  ('Appliances', 100),
  ('Other', 900)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "budget" ("starting_cents") VALUES (0) ON CONFLICT DO NOTHING;
