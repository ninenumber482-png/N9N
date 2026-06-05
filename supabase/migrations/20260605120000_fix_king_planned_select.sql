-- Fix king_planned SELECT access for anon role
-- The previous security hardening (20260602130000) only revoked INSERT/UPDATE,
-- but SELECT was also broken because RLS is enabled on the table (Supabase
-- default) and there was no SELECT policy for anon.

-- 1. Table-level grant
GRANT SELECT ON king_planned TO anon, authenticated, service_role;

-- 2. RLS policy — required because Supabase enables RLS by default on all
--    tables. Without this policy the anon JWT can authenticate but sees zero
--    rows even with the table-level GRANT.
DROP POLICY IF EXISTS anon_select_king_planned ON king_planned;
CREATE POLICY anon_select_king_planned ON king_planned
  FOR SELECT
  TO anon
  USING (true);

-- 3. RPC for engine to upsert planned digits (SECURITY DEFINER bypasses RLS)
--    Engine uses the anon key but this RPC runs with elevated privileges.
CREATE OR REPLACE FUNCTION upsert_king_planned(
  p_code VARCHAR(20),
  p_d1   SMALLINT,
  p_d2   SMALLINT,
  p_d3   SMALLINT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO king_planned (session_code, d1, d2, d3)
  VALUES (p_code, p_d1, p_d2, p_d3)
  ON CONFLICT (session_code) DO UPDATE
    SET d1 = EXCLUDED.d1, d2 = EXCLUDED.d2, d3 = EXCLUDED.d3,
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_king_planned TO anon;