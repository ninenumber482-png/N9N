-- =============================================================================
-- 3D KING ENGINE — INCREASE SETTLE WINDOW
-- Previous: settle only last 2 boundaries (~10 min)
-- New: settle last 12 boundaries (~1 hour)
-- This ensures bets are settled even if admin dashboard was closed for up to 1 hour.
-- The engine runs 24/7 via pg_cron, independent of any client.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.king_engine_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now  timestamptz := now();
  v_last timestamptz := to_timestamp(floor(extract(epoch FROM v_now) / 300) * 300);
  v_b    timestamptz;
  v_code text;
  v_pd1 int; v_pd2 int; v_pd3 int;
  v_has_plan boolean;
  i int;
BEGIN
  -- Skip this tick entirely if another is already running
  IF NOT pg_try_advisory_xact_lock(hashtext('king_engine_tick')::bigint) THEN
    RETURN;
  END IF;

  -- (1) PLAN upcoming sessions: v_last+5min .. +60min ahead (12 boundaries)
  FOR i IN 1..12 LOOP
    v_b   := v_last + (i * interval '5 min');
    v_code := to_char(v_b AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM king_planned WHERE session_code = v_code)
       AND NOT EXISTS (SELECT 1 FROM king_results WHERE session_code = v_code) THEN
      INSERT INTO king_planned (session_code, d1, d2, d3)
      VALUES (v_code, king_rand_digit(), king_rand_digit(), king_rand_digit())
      ON CONFLICT (session_code) DO NOTHING;
    END IF;
  END LOOP;

  -- (2) SETTLE the last 12 passed boundaries (~1 hour catch-up)
  -- This ensures all pending bets get settled even if admin was offline.
  FOR i IN 0..11 LOOP
    v_b   := v_last - (i * interval '5 min');
    v_code := to_char(v_b AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM king_results WHERE session_code = v_code) THEN
      SELECT d1, d2, d3, true INTO v_pd1, v_pd2, v_pd3, v_has_plan
        FROM king_planned WHERE session_code = v_code;
      IF v_has_plan IS TRUE THEN
        PERFORM settle_session(v_code, v_pd1, v_pd2, v_pd3);
      ELSE
        PERFORM settle_session(v_code,
          king_rand_digit(), king_rand_digit(), king_rand_digit());
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Keep revocation in place
REVOKE EXECUTE ON FUNCTION public.king_engine_tick() FROM anon, authenticated, public;

-- Self-validate: run the updated function
SELECT public.king_engine_tick();
