-- NUMBER9 — Admin: reset password & adjust balance for members
-- SECURITY DEFINER, service_role only (called via admin-proxy)

-- =============================================================================
-- 1. admin_reset_password — hash new password with pgcrypto, update user
-- =============================================================================
CREATE OR REPLACE FUNCTION admin_reset_password(
  p_admin_id UUID,
  p_user_id  UUID,
  p_new_password TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  v_hash TEXT;
  v_username TEXT;
BEGIN
  SELECT username INTO v_username FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  v_hash := crypt(p_new_password, gen_salt('bf', 12));

  UPDATE users
     SET password_hash = v_hash,
         updated_at = NOW()
   WHERE id = p_user_id;

  PERFORM log_admin_action(p_admin_id, 'RESET_PASSWORD', 'users', p_user_id,
    NULL, 'Password reset by admin');

  RETURN jsonb_build_object('success', true, 'username', v_username);
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_reset_password(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_reset_password(UUID, UUID, TEXT) TO service_role;

-- =============================================================================
-- 2. admin_adjust_balance — add or deduct wallet balance with audit trail
--    p_amount: positive = credit, negative = debit
-- =============================================================================
CREATE OR REPLACE FUNCTION admin_adjust_balance(
  p_admin_id UUID,
  p_user_id  UUID,
  p_amount   DECIMAL(12,2),
  p_reason   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_balance DECIMAL(12,2);
  v_new_balance DECIMAL(12,2);
  v_username TEXT;
BEGIN
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT username INTO v_username FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  SELECT balance_main INTO v_old_balance FROM wallet WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  v_new_balance := v_old_balance + p_amount;

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  UPDATE wallet
     SET balance_main = v_new_balance,
         updated_at = NOW()
   WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount, status, method, notes, processed_at, processed_by)
  VALUES (p_user_id,
          CASE WHEN p_amount > 0 THEN 'DEPOSIT' ELSE 'WITHDRAWAL' END,
          abs(p_amount),
          'COMPLETED',
          'ADJUSTMENT',
          COALESCE(p_reason, 'Manual adjustment by admin'),
          NOW(),
          p_admin_id);

  PERFORM log_admin_action(p_admin_id, 'ADJUST_BALANCE', 'wallet', p_user_id,
    v_old_balance::TEXT, v_new_balance::TEXT || ':' || COALESCE(p_reason, '-'));

  RETURN jsonb_build_object(
    'success', true,
    'username', v_username,
    'old_balance', v_old_balance,
    'new_balance', v_new_balance,
    'amount', p_amount
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_adjust_balance(UUID, UUID, DECIMAL, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_adjust_balance(UUID, UUID, DECIMAL, TEXT) TO service_role;
