-- Harden upsert_king_planned — require engine_api_key (same pattern as engine_settle).
--
-- BEFORE: upsert_king_planned(p_code, p_d1, p_d2, p_d3) was SECURITY DEFINER, granted
-- to anon, with NO authorization check. Anyone holding the public anon key could set
-- king_planned for any session → tamper with the planned draw (game-integrity hole).
--
-- AFTER: the function requires p_api_key matching platform_config.engine_api_key; an
-- anon caller without the secret gets ENGINE_UNAUTHORIZED. Only the engine/bot (which
-- holds the key) can write planned digits.

-- Drop the open (unauthenticated) 4-arg version.
DROP FUNCTION IF EXISTS upsert_king_planned(VARCHAR, SMALLINT, SMALLINT, SMALLINT);

CREATE OR REPLACE FUNCTION upsert_king_planned(
  p_api_key TEXT,
  p_code    VARCHAR(20),
  p_d1      SMALLINT,
  p_d2      SMALLINT,
  p_d3      SMALLINT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected TEXT;
BEGIN
  SELECT value INTO v_expected FROM platform_config WHERE key = 'engine_api_key';
  IF v_expected IS NULL OR p_api_key IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'ENGINE_UNAUTHORIZED';
  END IF;

  INSERT INTO king_planned (session_code, d1, d2, d3)
  VALUES (p_code, p_d1, p_d2, p_d3)
  ON CONFLICT (session_code) DO UPDATE
    SET d1 = EXCLUDED.d1, d2 = EXCLUDED.d2, d3 = EXCLUDED.d3,
        updated_at = NOW();
END;
$$;

-- anon may call (engine uses the anon key) but must pass the secret; never PUBLIC/authenticated.
REVOKE EXECUTE ON FUNCTION upsert_king_planned(TEXT, VARCHAR, SMALLINT, SMALLINT, SMALLINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION upsert_king_planned(TEXT, VARCHAR, SMALLINT, SMALLINT, SMALLINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION upsert_king_planned(TEXT, VARCHAR, SMALLINT, SMALLINT, SMALLINT) TO anon, service_role;
