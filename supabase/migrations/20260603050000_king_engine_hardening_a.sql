-- =============================================================================
-- 3D KING ENGINE — HARDENING BATCH A
-- (1) Advisory xact-lock so overlapping ticks never do redundant/racy work.
-- (2) Cryptographic RNG (pgcrypto) with rejection sampling — replaces random()
--     (predictable PRNG) for fair, unpredictable draws.
-- (3) Watchdog cron that raises a security_alerts row if results go stale —
--     the missing piece that let the engine sit dead for ~8h unnoticed.
-- =============================================================================

-- (2) Crypto RNG digit 0..9, rejection-sampled to remove modulo bias (256 % 10
-- != 0, so bytes 250..255 are rejected). Hard cap on iterations as a safety net.
CREATE OR REPLACE FUNCTION public.king_rand_digit()
RETURNS int
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  b int;
  tries int := 0;
BEGIN
  LOOP
    b := get_byte(extensions.gen_random_bytes(1), 0);  -- 0..255, CSPRNG
    EXIT WHEN b < 250 OR tries >= 16;                  -- 250 = largest *10 <= 256
    tries := tries + 1;
  END LOOP;
  RETURN b % 10;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.king_rand_digit() FROM anon, authenticated, public;

-- (1)+(2) Re-define the tick: advisory lock guard + crypto RNG for all digits.
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
  -- Skip this tick entirely if another is already running (auto-released at
  -- txn end). Settlement is already idempotent; this just avoids redundant work.
  IF NOT pg_try_advisory_xact_lock(hashtext('king_engine_tick')::bigint) THEN
    RETURN;
  END IF;

  -- (1) PLAN upcoming sessions: v_last+5min (current OPEN) .. +60min ahead.
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

  -- (2) SETTLE the last 2 passed boundaries (current just-passed + one prior).
  FOR i IN 0..1 LOOP
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
REVOKE EXECUTE ON FUNCTION public.king_engine_tick() FROM anon, authenticated, public;

-- (3) Watchdog: alert if the newest published result is older than ~7 min
-- (>1 missed boundary). Anti-spam: skip if an unresolved ENGINE_STALL alert was
-- raised in the last 10 min. Records a heartbeat metric every run for dashboards.
CREATE OR REPLACE FUNCTION public.king_engine_watchdog()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_age_sec int;
BEGIN
  SELECT extract(epoch FROM (now() - max(created_at)))::int INTO v_age_sec
    FROM king_results;

  INSERT INTO metrics (metric_name, metric_value, tags)
  VALUES ('king_engine_result_age_sec', COALESCE(v_age_sec, -1), '{"source":"watchdog"}'::jsonb);

  IF v_age_sec IS NULL OR v_age_sec > 420 THEN
    IF NOT EXISTS (
      SELECT 1 FROM security_alerts
      WHERE alert_type = 'ENGINE_STALL'
        AND resolved_at IS NULL
        AND created_at > now() - interval '10 min'
    ) THEN
      INSERT INTO security_alerts (alert_type, severity, description, details)
      VALUES ('ENGINE_STALL', 'critical',
        'King engine produced no result for ' || COALESCE(v_age_sec::text,'(none ever)') || 's',
        jsonb_build_object('age_sec', v_age_sec, 'detected_at', now()));
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.king_engine_watchdog() FROM anon, authenticated, public;

SELECT cron.schedule('king-engine-watchdog', '*/5 * * * *', 'SELECT public.king_engine_watchdog();');

-- Retention: cron.job_run_details + engine metrics grow unbounded (~1.7k rows/day
-- from the 1-min tick + 5-min watchdog). Prune nightly to prevent slow bloat.
CREATE OR REPLACE FUNCTION public.king_engine_prune()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
  DELETE FROM metrics
   WHERE recorded_at < now() - interval '7 days'
     AND metric_name LIKE 'king_engine_%';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.king_engine_prune() FROM anon, authenticated, public;
SELECT cron.schedule('king-engine-prune', '17 3 * * *', 'SELECT public.king_engine_prune();');

-- Self-validation: run the redefined functions inside this txn. If the new tick
-- fails in the SECURITY DEFINER context (e.g. crypto RNG privilege/search_path),
-- this throws and the whole migration ROLLS BACK — the old working tick survives.
-- Idempotent (settle_session PK + ON CONFLICT), so safe to run here.
SELECT public.king_engine_tick();
SELECT public.king_engine_watchdog();
