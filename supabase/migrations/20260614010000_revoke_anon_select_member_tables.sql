-- ============================================================================
-- Phase 2: Revoke anon/authenticated SELECT on member tables
--
-- Pre-conditions (all satisfied before this migration runs):
--   1. React: all direct .from(member_table) reads replaced with SECURITY DEFINER RPCs
--   2. Angular: _pollTransactions/Wallets/Bets route via admin-proxy (service_role)
--   3. Angular: realtime handlers fall back to admin-proxy poll on empty payload
--   4. Edge fn get-user-wallet: uses service_role key
--   5. RPCs (get_my_wallet/transactions/bets/referrals/full_profile) are SECURITY DEFINER
--      → still callable by anon (GRANT EXECUTE stays), bypass SELECT internally
--
-- Rollback: run 20260613070000_rollback_phase2_t3_regrant.sql (re-grants SELECT)
-- ============================================================================

REVOKE SELECT ON TABLE public.users        FROM anon, authenticated;
REVOKE SELECT ON TABLE public.wallet       FROM anon, authenticated;
REVOKE SELECT ON TABLE public.transactions FROM anon, authenticated;
REVOKE SELECT ON TABLE public.bets         FROM anon, authenticated;

-- service_role retains full access (never revoked)
-- Admin reads go through admin-proxy (service_role) or SECURITY DEFINER RPCs
-- User reads go through SECURITY DEFINER RPCs (self-scoped via x-user-token)
-- king_results, platform_config, platform_accounts remain anon-readable (public data)
