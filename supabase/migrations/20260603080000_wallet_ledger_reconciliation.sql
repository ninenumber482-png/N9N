-- NUMBER9 — Immutable Wallet Ledger + Daily Reconciliation
--
-- wallet_ledger: append-only record of every balance mutation
-- daily_reconciliation(): validates Σ deposits + Σ wins - Σ bets - Σ withdrawals = Σ balance

BEGIN;

-- =============================================================================
-- 1. Immutable wallet_ledger table
-- =============================================================================
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id),
  delta         DECIMAL(12,2) NOT NULL,     -- change amount (+ / -)
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after  DECIMAL(12,2) NOT NULL,    -- balance_main AFTER this change
  reason        VARCHAR(32) NOT NULL,       -- 'DEPOSIT' | 'BET' | 'WIN' | 'WITHDRAWAL' | 'REFUND' | 'ADMIN'
  reference_id  UUID,                       -- transactions.id or bets.id
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_date ON wallet_ledger(created_at);

-- Trigger: NO UPDATE or DELETE allowed on wallet_ledger
CREATE OR REPLACE FUNCTION trg_protect_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'LEDGER_IMMUTABLE: wallet_ledger is append-only. UPDATE/DELETE not allowed.';
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_ledger_protect ON wallet_ledger;
CREATE TRIGGER trg_wallet_ledger_protect
  BEFORE UPDATE OR DELETE ON wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION trg_protect_ledger();

-- =============================================================================
-- 2. Helper: insert ledger row + update balance atomically
-- =============================================================================
CREATE OR REPLACE FUNCTION ledger_balance_change(
  p_user_id  UUID,
  p_delta    DECIMAL(12,2),
  p_reason   VARCHAR,
  p_ref_id   UUID DEFAULT NULL
) RETURNS DECIMAL(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_before DECIMAL(12,2);
  v_after  DECIMAL(12,2);
BEGIN
  SELECT balance_main INTO v_before FROM wallet WHERE user_id = p_user_id FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

  v_after := v_before + p_delta;

  UPDATE wallet SET balance_main = v_after, updated_at = NOW() WHERE user_id = p_user_id;

  INSERT INTO wallet_ledger (user_id, delta, balance_before, balance_after, reason, reference_id)
  VALUES (p_user_id, p_delta, v_before, v_after, p_reason, p_ref_id);

  RETURN v_after;
END;
$$;

REVOKE EXECUTE ON FUNCTION ledger_balance_change(UUID, DECIMAL, VARCHAR, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION ledger_balance_change(UUID, DECIMAL, VARCHAR, UUID) TO service_role;

-- =============================================================================
-- 3. Daily reconciliation
-- =============================================================================
CREATE OR REPLACE FUNCTION daily_reconciliation(
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  metric    TEXT,
  amount    DECIMAL(12,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deposits    DECIMAL;
  v_withdrawals DECIMAL;
  v_bet_stakes  DECIMAL;
  v_wins        DECIMAL;
  v_balance     DECIMAL;
  v_diff        DECIMAL;
BEGIN
  -- Σ deposits (COMPLETED)
  SELECT COALESCE(SUM(amount), 0) INTO v_deposits
  FROM transactions WHERE type = 'DEPOSIT' AND status = 'COMPLETED'
  AND DATE(created_at) <= p_date;

  -- Σ withdrawal requests (COMPLETED — already deducted at submit)
  SELECT COALESCE(SUM(amount), 0) INTO v_withdrawals
  FROM transactions WHERE type = 'WITHDRAWAL' AND status = 'COMPLETED'
  AND DATE(created_at) <= p_date;

  -- Σ bet stakes (SETTLED — all settled bets' stakes)
  SELECT COALESCE(SUM(stake), 0) INTO v_bet_stakes
  FROM bets WHERE status = 'SETTLED'
  AND DATE(created_at) <= p_date;

  -- Σ wins (actual_payout for WIN bets)
  SELECT COALESCE(SUM(actual_payout), 0) INTO v_wins
  FROM bets WHERE result = 'WIN' AND status = 'SETTLED'
  AND DATE(created_at) <= p_date;

  -- Σ current balance_main
  SELECT COALESCE(SUM(balance_main), 0) INTO v_balance
  FROM wallet;

  -- Expected: deposits - withdrawals - stakes + wins = current balance
  -- Rearranged: deposits - withdrawals - stakes + wins - balance = 0
  v_diff := v_deposits - v_withdrawals - v_bet_stakes + v_wins - v_balance;

  -- Alert if mismatch
  IF v_diff != 0 THEN
    INSERT INTO security_alerts (alert_type, severity, description, details)
    VALUES ('LEDGER_MISMATCH', 'critical',
      'Wallet reconciliation failed! Difference: ' || v_diff,
      jsonb_build_object(
        'date', p_date,
        'deposits', v_deposits,
        'withdrawals', v_withdrawals,
        'bet_stakes', v_bet_stakes,
        'wins', v_wins,
        'balance', v_balance,
        'difference', v_diff
      ));
  END IF;

  RETURN QUERY
  SELECT 'deposits'::TEXT, v_deposits
  UNION ALL SELECT 'withdrawals', v_withdrawals
  UNION ALL SELECT 'bet_stakes', v_bet_stakes
  UNION ALL SELECT 'wins', v_wins
  UNION ALL SELECT 'balance_main', v_balance
  UNION ALL SELECT 'difference', v_diff;
END;
$$;

REVOKE EXECUTE ON FUNCTION daily_reconciliation(DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION daily_reconciliation(DATE) TO service_role;

COMMIT;
