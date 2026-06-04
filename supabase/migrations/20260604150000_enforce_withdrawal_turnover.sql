-- NUMBER9 — Enforce withdrawal turnover + balance server-side
--
-- The turnover gate was client-only (checkWithdrawEligibility in wallet.js), so a
-- direct submit_withdrawal RPC call bypassed it. This adds a server-side backstop:
--   - balance: amount must not exceed wallet.balance_main (mirrors client)
--   - turnover: cumulative wagered (wallet.total_turnover) must cover 1x of all
--     deposits (SUM of deposit_locks.turnover_required) — same model as the UI.
-- Admin approvals go through approve_withdrawal (service_role), which is unaffected.

BEGIN;

CREATE OR REPLACE FUNCTION submit_withdrawal(
  p_user_id             UUID,
  p_amount              DECIMAL(12,2),
  p_method              VARCHAR DEFAULT 'Bank Transfer',
  p_bank_name           VARCHAR DEFAULT NULL,
  p_bank_account_number VARCHAR DEFAULT NULL,
  p_bank_account_name   VARCHAR DEFAULT NULL,
  p_idempotency_key     VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_tx JSONB;
  v_session_token TEXT;
  v_actual_user_id UUID;
  v_balance DECIMAL(12,2);
  v_turnover DECIMAL(12,2);
  v_required DECIMAL(12,2);
BEGIN
  -- Verify caller identity — ALWAYS required (no bypass)
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT id INTO v_actual_user_id FROM users
    WHERE session_token = v_session_token AND session_expires_at > NOW();
  IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Enforce balance (mirrors client check)
  SELECT balance_main, COALESCE(total_turnover, 0)
    INTO v_balance, v_turnover
    FROM wallet WHERE user_id = p_user_id;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  -- Enforce turnover: cumulative wagered must cover 1x of all deposits.
  SELECT COALESCE(SUM(turnover_required), 0) INTO v_required
    FROM deposit_locks WHERE user_id = p_user_id;
  IF v_turnover < v_required THEN
    RAISE EXCEPTION 'TURNOVER_NOT_MET';
  END IF;

  INSERT INTO transactions (user_id, type, amount, status, method, bank_name, bank_account_number, bank_account_name, idempotency_key)
  VALUES (p_user_id, 'WITHDRAWAL', p_amount, 'PENDING', p_method, p_bank_name, p_bank_account_number, p_bank_account_name, p_idempotency_key)
  RETURNING jsonb_build_object(
    'id', id,
    'created_at', created_at,
    'amount', amount,
    'status', status
  ) INTO v_tx;

  RETURN v_tx;
END;
$$;

COMMIT;
