-- NUMBER9 Security Hardening — Fix PUBLIC grant issue
-- PostgreSQL grants EXECUTE TO PUBLIC by default for all functions.
-- REVOKE FROM anon/authenticated is insufficient because PUBLIC grant
-- still covers those roles. We must REVOKE FROM PUBLIC and explicitly
-- GRANT to service_role only for admin RPCs.

-- =============================================================================
-- 1. Admin RPCs: REVOKE PUBLIC, GRANT to service_role only
-- =============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT proname, oid::regprocedure AS sig
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN (
        'approve_deposit', 'reject_deposit',
        'approve_withdrawal', 'reject_withdrawal',
        'approve_user', 'reject_user',
        'generate_referral_code', 'get_referral_stats',
        'settle_session', 'log_admin_action'
      )
  ) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- =============================================================================
-- 2. User-facing RPCs: keep PUBLIC access (already functional)
--    place_bet, submit_deposit, submit_withdrawal, increment_referral_used
--    are called by the React app (anon key) and already have PUBLIC grant.
-- =============================================================================

-- =============================================================================
-- 3. Remove the test session we accidentally created
-- =============================================================================
DELETE FROM king_results WHERE session_code = 'TEST';
