-- Custom migration (hand-written), OD-162: pin set_updated_at()'s search_path, so Supabase's
-- linter (0011 function_search_path_mutable) is satisfied and a future edit can't pick up
-- objects from whatever search_path a session has. '' is what Supabase recommends; the body only
-- calls now(), which lives in pg_catalog and is always found
-- (https://github.com/supabase/splinter/blob/main/docs/0011_function_search_path_mutable.md,
-- https://www.postgresql.org/docs/17/runtime-config-client.html). Replacing the function keeps
-- every trigger attached and the owner and grants as they are
-- (https://www.postgresql.org/docs/17/sql-createfunction.html). 0001 created it in public.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
