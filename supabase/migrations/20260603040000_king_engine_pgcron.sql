-- =============================================================================
-- 3D KING ENGINE — SERVER-SIDE (pg_cron)
-- Replaces the fragile "engine only runs while an admin keeps /3dking open in a
-- browser" model with a 24/7 server-side tick. Mirrors the Angular engine's
-- plan-then-settle flow on the SAME UTC session-code convention (king.js codeFor
-- / 3dking.fmtCode): session_code = YYYYMMDDHH24MI of the UTC result boundary,
-- minute floored to 5. Betting window [B-5min, B-1min], lock at B-1min, draw at B.
--
-- Each tick:
--   (1) PLAN: for the next ~12 upcoming result-boundaries, ensure a king_planned
--       row exists (random digits, NEVER overwrites an existing plan → admin
--       category-override via a future RPC stays authoritative). Committing the
--       draw while the round is OPEN is what lets settle_session settle on the
--       intended digits rather than fresh randomness at boundary time.
--   (2) SETTLE: for the last 2 passed boundaries (<=10 min) with no result yet,
--       call settle_session() (idempotent via king_results PK; reads king_planned
--       as authoritative). Deliberately SHORT window — does NOT backfill the
--       multi-hour dead-engine gap on random digits.
-- =============================================================================

-- --- Harden table grants (defence-in-depth; full RLS audit is a later phase) ---
-- king_planned is the pre-lock secret: already RLS-locked + anon-revoked in the
-- previous migration. king_results is the PUBLISHED result: anon must keep SELECT
-- (React reads it) but must NOT be able to write its own winning rows.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.king_results FROM anon, authenticated;
-- settle_session() is SECURITY DEFINER (owned by a privileged role) so it still
-- writes king_results regardless of the anon grants above.

-- --- Engine tick ---
CREATE OR REPLACE FUNCTION public.king_engine_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now  timestamptz := now();
  -- most recent 5-min boundary <= now, via epoch flooring (timezone-independent:
  -- never relies on the session TIMEZONE, unlike date_trunc/extract(minute)).
  v_last timestamptz := to_timestamp(floor(extract(epoch FROM v_now) / 300) * 300);
  v_b    timestamptz;
  v_code text;
  v_pd1 int; v_pd2 int; v_pd3 int;
  v_has_plan boolean;
  i int;
BEGIN
  -- (1) PLAN upcoming sessions: v_last+5min (current OPEN) .. +60min ahead.
  FOR i IN 1..12 LOOP
    v_b   := v_last + (i * interval '5 min');
    v_code := to_char(v_b AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM king_planned WHERE session_code = v_code)
       AND NOT EXISTS (SELECT 1 FROM king_results WHERE session_code = v_code) THEN
      INSERT INTO king_planned (session_code, d1, d2, d3)
      VALUES (v_code,
              floor(random()*10)::int,
              floor(random()*10)::int,
              floor(random()*10)::int)
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
          floor(random()*10)::int, floor(random()*10)::int, floor(random()*10)::int);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Engine runs server-side as the function owner; no client may invoke it.
REVOKE EXECUTE ON FUNCTION public.king_engine_tick() FROM anon, authenticated, public;

-- --- Schedule via pg_cron (every minute; <=60s settle latency) ---
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('king-engine-tick', '* * * * *', 'SELECT public.king_engine_tick();');

-- Bootstrap once so plans/results exist immediately (don't wait for first tick).
SELECT public.king_engine_tick();
