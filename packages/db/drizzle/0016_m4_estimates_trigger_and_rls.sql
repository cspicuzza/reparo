-- Custom migration (hand-written), M4 / OD-62. Pairs with 0015_m4_estimates: the updated_at
-- trigger and RLS (on, no policies), as for every table.
CREATE TRIGGER estimates_set_updated_at BEFORE UPDATE ON "estimates" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "estimates" ENABLE ROW LEVEL SECURITY;
