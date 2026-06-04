-- NUMBER9 — RPC for user profile + wallet + turnover (bypasses RLS)
--
-- Masalah: RLS policies pada users & wallet table block SELECT untuk beberapa
-- user karena session token verification. RPC ini pakai SECURITY DEFINER.

CREATE OR REPLACE FUNCTION get_my_full_profile()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_session_token TEXT;
  v_user RECORD;
  v_wallet RECORD;
  v_lock_remaining DECIMAL(12,2);
  v_lock_count INT;
  v_ref_code TEXT;
BEGIN
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT id INTO v_user_id FROM users
    WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex')
      AND session_expires_at > NOW();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT id, username, display_name, email, phone, country, role,
         account_status, registration_status, login_status, kyc_status,
         referral_code, bank_name, bank_account_number, bank_account_name,
         created_at, approved_at
    INTO v_user FROM users WHERE id = v_user_id;

  SELECT balance_main, balance_bonus, total_deposited, total_withdrawn, total_turnover
    INTO v_wallet FROM wallet WHERE user_id = v_user_id;

  SELECT COALESCE(SUM(turnover_required - turnover_applied), 0), COUNT(*)
    INTO v_lock_remaining, v_lock_count
    FROM deposit_locks WHERE user_id = v_user_id AND turnover_applied < turnover_required;

  SELECT code INTO v_ref_code FROM referrals WHERE id = v_user.referred_by;

  RETURN jsonb_build_object(
    'uuid', v_user.id,
    'username', v_user.username,
    'displayName', v_user.display_name,
    'email', v_user.email,
    'phone', v_user.phone,
    'country', v_user.country,
    'role', v_user.role,
    'account_status', v_user.account_status,
    'registration_status', v_user.registration_status,
    'login_status', v_user.login_status,
    'kyc_status', v_user.kyc_status,
    'referralCode', v_user.referral_code,
    'referredByCode', v_ref_code,
    'bankName', v_user.bank_name,
    'bankAccountNumber', v_user.bank_account_number,
    'bankAccountName', v_user.bank_account_name,
    'createdAt', v_user.created_at,
    'approvedAt', v_user.approved_at,
    'wallet_main', v_wallet.balance_main,
    'wallet_bonus', v_wallet.balance_bonus,
    'total_deposited', v_wallet.total_deposited,
    'total_withdrawn', v_wallet.total_withdrawn,
    'total_turnover', v_wallet.total_turnover,
    'lock_remaining', v_lock_remaining,
    'lock_count', v_lock_count,
    'is_unlocked', v_lock_remaining <= 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_full_profile() TO anon, authenticated, service_role;
