-- Custom migration (hand-written), M2 / OD-44. Pairs with 0010_vendors: the updated_at trigger
-- and RLS (on, no policies) for the new table, as for every table.
CREATE TRIGGER vendors_set_updated_at BEFORE UPDATE ON "vendors" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;
