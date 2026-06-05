-- Fix king_planned RLS — anon needs a SELECT policy
-- Table-level GRANT SELECT was applied in 20260605120000, but RLS is enabled
-- on the table (Supabase default) so a policy is also required. Without it
-- the anon JWT authenticates but sees zero rows.

DROP POLICY IF EXISTS anon_select_king_planned ON king_planned;
CREATE POLICY anon_select_king_planned ON king_planned
  FOR SELECT
  TO anon
  USING (true);
