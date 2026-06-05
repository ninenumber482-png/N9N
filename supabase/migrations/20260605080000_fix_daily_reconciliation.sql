-- Fix daily_reconciliation: the old formula compared one-day's activity against
-- the ALL-TIME wallet balance, which always produced a spurious LEDGER_MISMATCH.
-- Correct formula: all-time_deposits - all-time_withdrawals - all-time_bet_stakes
--                  + all-time_wins = current wallet balance  (should be 0 diff).
-- The p_date parameter now only scopes the daily activity reporting rows.

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
  v_start              TIMESTAMP := p_date::TIMESTAMP;
  v_end                TIMESTAMP := (p_date + INTERVAL '1 day')::TIMESTAMP;
  v_deposits_today     DECIMAL;
  v_withdrawals_today  DECIMAL;
  v_bet_stakes_today   DECIMAL;
  v_wins_today         DECIMAL;
  v_deposits_alltime   DECIMAL;
  v_withdrawals_alltime DECIMAL;
  v_bet_stakes_alltime  DECIMAL;
  v_wins_alltime        DECIMAL;
  v_balance            DECIMAL;
  v_ledger_diff        DECIMAL;
BEGIN
  -- Daily activity (reporting only, range-indexed)
  SELECT COALESCE(SUM(amount), 0) INTO v_deposits_today
  FROM transactions WHERE type = 'DEPOSIT' AND status = 'COMPLETED'
    AND created_at >= v_start AND created_at < v_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_withdrawals_today
  FROM transactions WHERE type = 'WITHDRAWAL' AND status = 'COMPLETED'
    AND created_at >= v_start AND created_at < v_end;

  SELECT COALESCE(SUM(stake), 0) INTO v_bet_stakes_today
  FROM bets WHERE status = 'SETTLED'
    AND created_at >= v_start AND created_at < v_end;

  SELECT COALESCE(SUM(actual_payout), 0) INTO v_wins_today
  FROM bets WHERE result = 'WIN' AND status = 'SETTLED'
    AND created_at >= v_start AND created_at < v_end;

  -- All-time totals for ledger reconciliation (no date filter)
  SELECT COALESCE(SUM(amount), 0) INTO v_deposits_alltime
  FROM transactions WHERE type = 'DEPOSIT' AND status = 'COMPLETED';

  SELECT COALESCE(SUM(amount), 0) INTO v_withdrawals_alltime
  FROM transactions WHERE type = 'WITHDRAWAL' AND status = 'COMPLETED';

  SELECT COALESCE(SUM(stake), 0) INTO v_bet_stakes_alltime
  FROM bets WHERE status = 'SETTLED';

  SELECT COALESCE(SUM(actual_payout), 0) INTO v_wins_alltime
  FROM bets WHERE result = 'WIN' AND status = 'SETTLED';

  -- Current total wallet balance
  SELECT COALESCE(SUM(balance_main), 0) INTO v_balance FROM wallet;

  -- Invariant: money_in - money_out = current_holdings
  -- money_in  = deposits + winnings_paid_out
  -- money_out = withdrawals + bet_stakes
  -- current_holdings = wallet balance
  v_ledger_diff := v_deposits_alltime - v_withdrawals_alltime
                   - v_bet_stakes_alltime + v_wins_alltime
                   - v_balance;

  IF v_ledger_diff != 0 THEN
    INSERT INTO security_alerts (alert_type, severity, description, details)
    VALUES ('LEDGER_MISMATCH', 'critical',
      'Ledger reconciliation failed! Difference: ' || v_ledger_diff,
      jsonb_build_object(
        'date', p_date,
        'alltime_deposits',    v_deposits_alltime,
        'alltime_withdrawals', v_withdrawals_alltime,
        'alltime_bet_stakes',  v_bet_stakes_alltime,
        'alltime_wins',        v_wins_alltime,
        'current_balance',     v_balance,
        'ledger_difference',   v_ledger_diff
      ));
  END IF;

  RETURN QUERY
  SELECT 'today_deposits'::TEXT,   v_deposits_today
  UNION ALL SELECT 'today_withdrawals',  v_withdrawals_today
  UNION ALL SELECT 'today_bet_stakes',   v_bet_stakes_today
  UNION ALL SELECT 'today_wins',         v_wins_today
  UNION ALL SELECT 'alltime_deposits',   v_deposits_alltime
  UNION ALL SELECT 'alltime_withdrawals',v_withdrawals_alltime
  UNION ALL SELECT 'alltime_bet_stakes', v_bet_stakes_alltime
  UNION ALL SELECT 'alltime_wins',       v_wins_alltime
  UNION ALL SELECT 'current_balance',    v_balance
  UNION ALL SELECT 'ledger_difference',  v_ledger_diff;
END;
$$;

REVOKE EXECUTE ON FUNCTION daily_reconciliation(DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION daily_reconciliation(DATE) TO service_role;
