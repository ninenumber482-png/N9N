-- ============================================================================
-- Deposit account gated-reveal — get_deposit_account() RPC (additive).
-- NOT YET APPLIED to production. Safe to apply anytime (creates a function only).
--
-- Login-gated reveal of the single ACTIVE destination bank account. The account
-- number is never in initial HTML / never served to anon; the user must be a
-- valid session AND explicitly call this RPC ("Check / Load System" button).
-- platform_accounts stays anon-SELECT-revoked (20260614030000); this RPC is the
-- only user-facing path, login-gated via get_user_id().
-- Spec: docs/superpowers/specs/2026-06-14-deposit-account-gated-reveal-design.md
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_deposit_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid   uuid;
  v_maint text;
  v       jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'NO_SESSION');
  END IF;

  -- "tidak ada yang janggal": don't hand out an account while the platform is down.
  SELECT value INTO v_maint FROM platform_config WHERE key = 'maintenance_mode';
  IF v_maint = 'true' THEN
    RETURN jsonb_build_object('error', 'MAINTENANCE');
  END IF;

  -- Deterministic single ACTIVE bank account (most-recently-updated wins).
  SELECT to_jsonb(a) INTO v FROM (
    SELECT provider_name, account_holder, account_number, instructions
    FROM platform_accounts
    WHERE status = 'ACTIVE' AND type = 'BANK'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  ) a;

  IF v IS NULL THEN
    RETURN jsonb_build_object('error', 'NO_ACCOUNT');
  END IF;

  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_deposit_account() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_deposit_account() TO anon, authenticated, service_role;
