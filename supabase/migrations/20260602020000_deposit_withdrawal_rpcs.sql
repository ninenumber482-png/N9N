-- NUMBER9 — Atomic deposit & withdrawal approval RPCs
-- These run as SECURITY DEFINER (postgres) so they can atomically
-- update both the transactions table and the wallet balance.

-- ── approve_deposit ───────────────────────────────────────────────────────────
-- Sets status=COMPLETED and credits wallet.balance_main + total_deposited.
CREATE OR REPLACE FUNCTION approve_deposit(
  p_tx_id    UUID,
  p_admin_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_amount  DECIMAL(12,2);
BEGIN
  SELECT user_id, amount INTO v_user_id, v_amount
    FROM transactions WHERE id = p_tx_id AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found or not PENDING';
  END IF;

  UPDATE transactions
     SET status = 'COMPLETED', processed_at = NOW(), processed_by = p_admin_id
   WHERE id = p_tx_id;

  UPDATE wallet
     SET balance_main   = balance_main   + v_amount,
         total_deposited = total_deposited + v_amount,
         updated_at      = NOW()
   WHERE user_id = v_user_id;

  PERFORM log_admin_action(p_admin_id, 'APPROVE_DEPOSIT', 'transactions', p_tx_id,
    'PENDING', 'COMPLETED:' || v_amount::TEXT);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_deposit(UUID, UUID) TO anon, authenticated, service_role;

-- ── reject_deposit ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_deposit(
  p_tx_id    UUID,
  p_admin_id UUID,
  p_reason   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE transactions
     SET status = 'FAILED', processed_at = NOW(), processed_by = p_admin_id,
         notes  = COALESCE(p_reason, 'Rejected by admin')
   WHERE id = p_tx_id AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found or not PENDING';
  END IF;

  PERFORM log_admin_action(p_admin_id, 'REJECT_DEPOSIT', 'transactions', p_tx_id,
    'PENDING', 'FAILED:' || COALESCE(p_reason, '-'));
END;
$$;

GRANT EXECUTE ON FUNCTION reject_deposit(UUID, UUID, TEXT) TO anon, authenticated, service_role;

-- ── approve_withdrawal ────────────────────────────────────────────────────────
-- Debits wallet.balance_main + increments total_withdrawn, then marks COMPLETED.
CREATE OR REPLACE FUNCTION approve_withdrawal(
  p_tx_id    UUID,
  p_admin_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_amount  DECIMAL(12,2);
  v_balance DECIMAL(12,2);
BEGIN
  SELECT user_id, amount INTO v_user_id, v_amount
    FROM transactions WHERE id = p_tx_id AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found or not PENDING';
  END IF;

  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = v_user_id FOR UPDATE;
  IF v_balance < v_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  UPDATE wallet
     SET balance_main    = balance_main    - v_amount,
         total_withdrawn = total_withdrawn + v_amount,
         updated_at      = NOW()
   WHERE user_id = v_user_id;

  UPDATE transactions
     SET status = 'COMPLETED', processed_at = NOW(), processed_by = p_admin_id
   WHERE id = p_tx_id;

  PERFORM log_admin_action(p_admin_id, 'APPROVE_WITHDRAWAL', 'transactions', p_tx_id,
    'PENDING', 'COMPLETED:' || v_amount::TEXT);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_withdrawal(UUID, UUID) TO anon, authenticated, service_role;

-- ── reject_withdrawal ─────────────────────────────────────────────────────────
-- No wallet change needed (balance was never debited at request time).
CREATE OR REPLACE FUNCTION reject_withdrawal(
  p_tx_id    UUID,
  p_admin_id UUID,
  p_reason   TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE transactions
     SET status = 'FAILED', processed_at = NOW(), processed_by = p_admin_id,
         notes  = COALESCE(p_reason, 'Rejected by admin')
   WHERE id = p_tx_id AND status = 'PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found or not PENDING';
  END IF;

  PERFORM log_admin_action(p_admin_id, 'REJECT_WITHDRAWAL', 'transactions', p_tx_id,
    'PENDING', 'FAILED:' || COALESCE(p_reason, '-'));
END;
$$;

GRANT EXECUTE ON FUNCTION reject_withdrawal(UUID, UUID, TEXT) TO anon, authenticated, service_role;
