-- NUMBER9 — Restore atomic balance deduction in submit_withdrawal
--
-- Bug introduced by 20260604160000_per_deposit_turnover.sql: when that
-- migration rewrote submit_withdrawal to gate on per-deposit turnover locks,
-- it dropped the atomic balance deduction that lived in
-- 20260602260000_fix_withdrawal_atomic.sql. As a result:
--   * User clicks withdraw → PENDING tx created, balance NOT deducted
--   * Admin approves → total_withdrawn incremented, balance unchanged (silent loss for house)
--   * Admin rejects → refund adds money the user never lost (silent gain for user)
--
-- Fix: restore the FOR UPDATE row lock + atomic deduction, keeping the
-- per-deposit turnover gate from the previous rewrite. Net effect:
--   submit_withdrawal  → lock row, gate on turnover, deduct balance, insert PENDING
--   approve_withdrawal → mark COMPLETED, increment total_withdrawn (no balance change)
--   reject_withdrawal  → refund the deducted amount, mark REJECTED

BEGIN;

-- =============================================================================
-- 1. submit_withdrawal — restore atomic balance deduction
-- =============================================================================
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
  v_balance DECIMAL(12,2);
  v_outstanding DECIMAL(12,2);
  v_tx JSONB;
  v_session_token TEXT;
  v_actual_user_id UUID;
BEGIN
  -- Verify caller identity
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

  -- Lock the wallet row first to prevent races with place_bet / concurrent withdrawals
  SELECT balance_main INTO v_balance
    FROM wallet WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  -- Enforce per-deposit turnover: any deposit lock with outstanding turnover blocks
  SELECT COALESCE(SUM(turnover_required - turnover_applied), 0) INTO v_outstanding
    FROM deposit_locks
   WHERE user_id = p_user_id AND turnover_applied < turnover_required;
  IF v_outstanding > 0 THEN
    RAISE EXCEPTION 'TURNOVER_NOT_MET';
  END IF;

  -- Deduct balance immediately (atomic — prevents double-spend with place_bet)
  UPDATE wallet
     SET balance_main = balance_main - p_amount,
         updated_at = NOW()
   WHERE user_id = p_user_id;

  -- Create PENDING transaction record
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

REVOKE EXECUTE ON FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM anon;
GRANT EXECUTE ON FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;

-- =============================================================================
-- 2. approve_withdrawal — idempotent guard + ensure not-already-processed
--    (balance was already deducted at submission; only mark COMPLETED + track total_withdrawn)
-- =============================================================================
CREATE OR REPLACE FUNCTION approve_withdrawal(p_tx_id UUID, p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_amount DECIMAL(12,2);
  v_status TEXT;
BEGIN
  SELECT user_id, amount, status INTO v_user_id, v_amount, v_status
    FROM transactions
   WHERE id = p_tx_id AND type = 'WITHDRAWAL'
   FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;
  IF v_status <> 'PENDING' THEN RAISE EXCEPTION 'TX_NOT_PENDING'; END IF;

  -- Balance already deducted at submission; just mark COMPLETED + increment total_withdrawn
  UPDATE transactions
     SET status = 'COMPLETED', processed_at = NOW(), processed_by = p_admin_id
   WHERE id = p_tx_id;

  UPDATE wallet
     SET total_withdrawn = COALESCE(total_withdrawn, 0) + v_amount,
         updated_at = NOW()
   WHERE user_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION approve_withdrawal(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION approve_withdrawal(UUID, UUID) TO authenticated, service_role;

-- =============================================================================
-- 3. reject_withdrawal — refund the deducted balance + idempotent guard
-- =============================================================================
CREATE OR REPLACE FUNCTION reject_withdrawal(p_tx_id UUID, p_admin_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_amount DECIMAL(12,2);
  v_status TEXT;
BEGIN
  SELECT user_id, amount, status INTO v_user_id, v_amount, v_status
    FROM transactions
   WHERE id = p_tx_id AND type = 'WITHDRAWAL'
   FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;
  IF v_status <> 'PENDING' THEN RAISE EXCEPTION 'TX_NOT_PENDING'; END IF;

  -- Refund the deducted balance back to the user
  UPDATE wallet
     SET balance_main = balance_main + v_amount,
         updated_at = NOW()
   WHERE user_id = v_user_id;

  UPDATE transactions
     SET status = 'REJECTED', processed_at = NOW(), processed_by = p_admin_id, notes = p_reason
   WHERE id = p_tx_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION reject_withdrawal(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION reject_withdrawal(UUID, UUID, TEXT) TO authenticated, service_role;

COMMIT;
