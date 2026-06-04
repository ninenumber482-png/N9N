-- NUMBER9 — RPC for user wallet + turnover summary (bypasses RLS via SECURITY DEFINER)
--
-- Masalah: fetchTurnoverSummary() di wallet.js query langsung wallet & deposit_locks
-- tapi RLS policies bisa block SELECT untuk user tertentu. RPC ini pakai
-- SECURITY DEFINER + verifikasi session_token untuk akses penuh.
--
-- Returns: { main, bonus, total_deposited, total_withdrawn, total_turnover,
--            lock_count, lock_remaining, lock_required, lock_applied, is_unlocked }

CREATE OR REPLACE FUNCTION get_my_wallet_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_session_token TEXT;
  v_wallet RECORD;
  v_lock_remaining DECIMAL(12,2);
  v_lock_count INT;
  v_lock_required DECIMAL(12,2);
  v_lock_applied DECIMAL(12,2);
BEGIN
  -- Verify session token
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT id INTO v_user_id FROM users
    WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex')
      AND session_expires_at > NOW();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- Get wallet data (handle NULL wallet gracefully)
  SELECT COALESCE(balance_main, 0), COALESCE(balance_bonus, 0),
         COALESCE(total_deposited, 0), COALESCE(total_withdrawn, 0),
         COALESCE(total_turnover, 0)
    INTO v_wallet FROM wallet WHERE user_id = v_user_id;
  IF v_wallet.balance_main IS NULL THEN
    v_wallet.balance_main := 0; v_wallet.balance_bonus := 0;
    v_wallet.total_deposited := 0; v_wallet.total_withdrawn := 0;
    v_wallet.total_turnover := 0;
  END IF;

  -- Get deposit lock summary
  SELECT COALESCE(SUM(turnover_required - turnover_applied), 0),
         COUNT(*),
         COALESCE(SUM(turnover_required), 0),
         COALESCE(SUM(turnover_applied), 0)
    INTO v_lock_remaining, v_lock_count, v_lock_required, v_lock_applied
    FROM deposit_locks
   WHERE user_id = v_user_id AND turnover_applied < turnover_required;

  RETURN jsonb_build_object(
    'main', v_wallet.balance_main,
    'bonus', v_wallet.balance_bonus,
    'total_deposited', v_wallet.total_deposited,
    'total_withdrawn', v_wallet.total_withdrawn,
    'total_turnover', v_wallet.total_turnover,
    'lock_count', v_lock_count,
    'lock_remaining', v_lock_remaining,
    'lock_required', v_lock_required,
    'lock_applied', v_lock_applied,
    'is_unlocked', v_lock_remaining <= 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_wallet_summary() TO anon, authenticated, service_role;
