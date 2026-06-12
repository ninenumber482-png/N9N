-- ============================================================================
-- Token-scoped read RPCs (Phase 2) — self-scope via get_user_id()
-- (x-user-token → sessions.token_hash → uuid). All GRANT TO anon; they NEVER
-- return another user's data. Additive: no SELECT revoked here.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_wallet()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','NO_SESSION'); END IF;
  SELECT to_jsonb(w) INTO v FROM (
    SELECT balance_main, balance_bonus, total_deposited, total_withdrawn, total_turnover
    FROM wallet WHERE user_id = v_uid
  ) w;
  RETURN COALESCE(v, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_transactions(p_limit int DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT id, reference_code, type, amount, status, method, bank_name,
           bank_account_number, bank_account_name, proof_image_url,
           created_at, processed_at, notes
    FROM transactions
    WHERE user_id = v_uid AND type IN ('DEPOSIT','WITHDRAWAL')
    ORDER BY created_at DESC LIMIT GREATEST(1, LEAST(p_limit, 500))
  ) t;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_bets(p_limit int DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(b ORDER BY b.created_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT id, session_code, bet_code, selection, stake, potential_payout,
           actual_payout, status, result, created_at, settled_at
    FROM bets WHERE user_id = v_uid
    ORDER BY created_at DESC LIMIT GREATEST(1, LEAST(p_limit, 500))
  ) b;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_referrals()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT id, username, display_name, account_status, registration_status, created_at
    FROM users WHERE referred_by_user = v_uid
    ORDER BY created_at DESC
  ) r;
  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_my_wallet(), public.get_my_transactions(int),
  public.get_my_bets(int), public.get_my_referrals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_wallet(), public.get_my_transactions(int),
  public.get_my_bets(int), public.get_my_referrals() TO anon, authenticated, service_role;
