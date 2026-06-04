-- NUMBER9 — Per-deposit turnover model (correct the cumulative approach)
--
-- Business rule (confirmed): each deposit requires 1x turnover, independently.
-- Bets fill the earliest incomplete deposit lock first (FIFO); excess beyond the
-- current locks is WASTED and does NOT carry forward to future deposits. A deposit
-- "resets" once its turnover is met. Withdrawal is allowed only when no deposit
-- lock has outstanding turnover. There is NO accumulation across deposits.
--
-- This migration:
--   1. Backfills deposit_locks.turnover_applied from actual wagered (FIFO),
--      repairing counters left stale by the old broken place_bet. The live
--      place_bet already maintains this correctly going forward.
--   2. Changes submit_withdrawal to gate on outstanding deposit locks (not on the
--      cumulative wallet.total_turnover), closing the client-only bypass.

BEGIN;

-- =============================================================================
-- 1. BACKFILL deposit_locks.turnover_applied (FIFO by created_at, VOID excluded)
--    applied = LEAST(required, GREATEST(0, valid_wagered - sum_of_earlier_required))
--    Absolute set (idempotent); ordering ties broken by id.
-- =============================================================================
WITH wagered AS (
  SELECT user_id, COALESCE(SUM(stake) FILTER (WHERE status <> 'VOID'), 0) AS valid_wagered
  FROM bets GROUP BY user_id
),
locks AS (
  SELECT dl.id, dl.user_id, dl.turnover_required,
         COALESCE(SUM(dl.turnover_required) OVER (
           PARTITION BY dl.user_id ORDER BY dl.created_at, dl.id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prev_req_sum
  FROM deposit_locks dl
)
UPDATE deposit_locks d
   SET turnover_applied = LEAST(l.turnover_required, GREATEST(0, w.valid_wagered - l.prev_req_sum))
  FROM locks l
  JOIN wagered w ON w.user_id = l.user_id
 WHERE d.id = l.id
   AND d.turnover_applied <> LEAST(l.turnover_required, GREATEST(0, w.valid_wagered - l.prev_req_sum));

-- =============================================================================
-- 2. submit_withdrawal — gate on outstanding deposit locks (per-deposit model)
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
  v_tx JSONB;
  v_session_token TEXT;
  v_actual_user_id UUID;
  v_balance DECIMAL(12,2);
  v_outstanding DECIMAL(12,2);
BEGIN
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
  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = p_user_id;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  -- Enforce per-deposit turnover: any deposit lock with outstanding turnover blocks.
  SELECT COALESCE(SUM(turnover_required - turnover_applied), 0) INTO v_outstanding
    FROM deposit_locks
   WHERE user_id = p_user_id AND turnover_applied < turnover_required;
  IF v_outstanding > 0 THEN
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
