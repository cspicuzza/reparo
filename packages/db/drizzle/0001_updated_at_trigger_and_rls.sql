-- Custom migration (hand-written). Two things every table in Reparo relies on:
--   1. set_updated_at(): keeps updated_at current on every UPDATE. New tables attach
--      the same trigger in their own migration.
--   2. Row Level Security ON with no policies: Supabase exposes every public table over
--      its REST API to anyone holding the publishable key (which the browser has). With
--      RLS on and no policies, that API returns nothing. The API server connects with
--      DATABASE_URL (the postgres role) and bypasses RLS.
--      Ref: https://supabase.com/docs/guides/deployment/going-into-prod

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER members_set_updated_at
  BEFORE UPDATE ON "members"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER files_set_updated_at
  BEFORE UPDATE ON "files"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
