-- =============================================================================
-- FIX: king_rand_digit() crashed the engine tick → no future plans, no settles.
--
-- The live king_rand_digit() called unqualified `gen_random_bytes(1)` with no
-- SET search_path. On Supabase pgcrypto lives in the `extensions` schema, and
-- king_engine_tick() runs with search_path = 'public' only, so every tick threw:
--     ERROR: function gen_random_bytes(integer) does not exist
-- The PLAN loop aborted on the first call → king_planned stopped filling future
-- sessions ("results ke depan hilang") and the SETTLE loop never ran either.
--
-- Fix: schema-qualify gen_random_bytes AND pin search_path so it resolves
-- regardless of caller context.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.king_rand_digit()
RETURNS int
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  b int;
  tries int := 0;
BEGIN
  LOOP
    b := get_byte(extensions.gen_random_bytes(1), 0);  -- 0..255, CSPRNG
    EXIT WHEN b < 250 OR tries >= 16;                  -- reject 250..255 (modulo bias)
    tries := tries + 1;
  END LOOP;
  RETURN b % 10;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.king_rand_digit() FROM anon, authenticated, public;

-- Backfill immediately: re-plan the upcoming hour and settle the just-missed
-- boundaries (idempotent — settle_session PK + ON CONFLICT DO NOTHING).
SELECT public.king_engine_tick();
