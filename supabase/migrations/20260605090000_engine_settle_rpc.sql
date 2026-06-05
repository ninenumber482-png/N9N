-- engine_settle: SECURITY DEFINER wrapper so the EC2 engine process can call
-- settle_session without anon-level access to the raw settle_session function.
-- Validates an engine_api_key stored in platform_config before proceeding.

-- Store the engine API key (same value as the bot's API_KEY constant)
INSERT INTO platform_config (key, value)
VALUES ('engine_api_key', '362745')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION engine_settle(
  p_api_key TEXT,
  p_code    TEXT,
  p_d1      INT,
  p_d2      INT,
  p_d3      INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_expected TEXT;
BEGIN
  SELECT value INTO v_expected FROM platform_config WHERE key = 'engine_api_key';
  IF v_expected IS NULL OR p_api_key IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'ENGINE_UNAUTHORIZED';
  END IF;
  PERFORM settle_session(p_code, p_d1, p_d2, p_d3);
END;
$$;

GRANT EXECUTE ON FUNCTION engine_settle(TEXT, TEXT, INT, INT, INT) TO anon;
REVOKE EXECUTE ON FUNCTION engine_settle(TEXT, TEXT, INT, INT, INT) FROM authenticated;
