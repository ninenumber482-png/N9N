-- ============================================================================
-- ROLLBACK: Restore original RPC implementations
-- ============================================================================
-- Jalankan ini jika RPC optimizations menyebabkan masalah.
-- ============================================================================

BEGIN;

-- 1. Restore original check_rate_limit (per-event rows)
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_action  TEXT,
  p_max     INT DEFAULT 30,
  p_window_ms INT DEFAULT 60000
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count INT;
  v_cutoff TIMESTAMP := NOW() - (p_window_ms * interval '1 ms');
BEGIN
  DELETE FROM user_rate_limits WHERE created_at < v_cutoff AND user_id = p_user_id;
  SELECT COUNT(*) INTO v_count
    FROM user_rate_limits
   WHERE user_id = p_user_id
     AND action = p_action
     AND created_at > v_cutoff;
  IF v_count >= p_max THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many % requests. Try again later.', p_action;
  END IF;
  INSERT INTO user_rate_limits (user_id, action) VALUES (p_user_id, p_action);
END;
$$;

REVOKE EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, INT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, INT, INT) TO service_role;

-- 2. Restore original place_bet (cursor loop)
-- Note: Ambil dari migration 20260603070000_user_rpc_rate_limit.sql
CREATE OR REPLACE FUNCTION place_bet(
  p_user_id     UUID,
  p_session_code VARCHAR,
  p_selections  JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total   DECIMAL(12,2);
  v_balance DECIMAL(12,2);
  v_count   INTEGER;
  v_session_token TEXT;
  v_actual_user_id UUID;
  v_remaining DECIMAL(12,2);
  v_lock RECORD;
BEGIN
  PERFORM check_rate_limit(p_user_id, 'PLACE_BET', 30, 60000);
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT id INTO v_actual_user_id FROM users
    WHERE session_token = v_session_token AND session_expires_at > NOW();
  IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT COALESCE(SUM((s->>'stake')::DECIMAL), 0) INTO v_total FROM jsonb_array_elements(p_selections) AS s;
  IF v_total <= 0 THEN RAISE EXCEPTION 'INVALID_STAKE'; END IF;
  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_balance < v_total THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  INSERT INTO bets (user_id, session_code, bet_code, selection, stake, potential_payout, status)
  SELECT p_user_id, p_session_code, s->>'bet_code', s->>'selection',
         (s->>'stake')::DECIMAL, (s->>'potential_payout')::DECIMAL, 'PENDING'
  FROM jsonb_array_elements(p_selections) AS s;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE wallet SET balance_main = balance_main - v_total, total_turnover = total_turnover + v_total, updated_at = NOW()
   WHERE user_id = p_user_id;
  v_remaining := v_total;
  FOR v_lock IN
    SELECT id, turnover_required, turnover_applied
      FROM deposit_locks WHERE user_id = p_user_id AND turnover_applied < turnover_required
      ORDER BY created_at ASC FOR UPDATE
  LOOP
    IF v_remaining <= 0 THEN EXIT; END IF;
    DECLARE v_needed DECIMAL(12,2) := v_lock.turnover_required - v_lock.turnover_applied;
            v_apply DECIMAL(12,2);
    BEGIN
      v_apply := LEAST(v_needed, v_remaining);
      UPDATE deposit_locks SET turnover_applied = turnover_applied + v_apply WHERE id = v_lock.id;
      v_remaining := v_remaining - v_apply;
    END;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) TO anon, authenticated, service_role;

-- 3. Restore original daily_reconciliation (DATE function)
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
  SELECT COALESCE(SUM(amount), 0) INTO v_deposits
  FROM transactions WHERE type = 'DEPOSIT' AND status = 'COMPLETED'
  AND DATE(created_at) <= p_date;
  SELECT COALESCE(SUM(amount), 0) INTO v_withdrawals
  FROM transactions WHERE type = 'WITHDRAWAL' AND status = 'COMPLETED'
  AND DATE(created_at) <= p_date;
  SELECT COALESCE(SUM(stake), 0) INTO v_bet_stakes
  FROM bets WHERE status = 'SETTLED'
  AND DATE(created_at) <= p_date;
  SELECT COALESCE(SUM(actual_payout), 0) INTO v_wins
  FROM bets WHERE result = 'WIN' AND status = 'SETTLED'
  AND DATE(created_at) <= p_date;
  SELECT COALESCE(SUM(balance_main), 0) INTO v_balance
  FROM wallet;
  v_diff := v_deposits - v_withdrawals - v_bet_stakes + v_wins - v_balance;
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

-- 4. Restore original king_engine_tick (loop dengan NOT EXISTS)
CREATE OR REPLACE FUNCTION king_engine_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now  timestamptz := now();
  v_last timestamptz := to_timestamp(floor(extract(epoch FROM v_now) / 300) * 300);
  v_b    timestamptz;
  v_code text;
  v_pd1 int; v_pd2 int; v_pd3 int;
  v_has_plan boolean;
  i int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('king_engine_tick')::bigint) THEN
    RETURN;
  END IF;
  FOR i IN 1..12 LOOP
    v_b   := v_last + (i * interval '5 min');
    v_code := to_char(v_b AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM king_planned WHERE session_code = v_code)
       AND NOT EXISTS (SELECT 1 FROM king_results WHERE session_code = v_code) THEN
      INSERT INTO king_planned (session_code, d1, d2, d3)
      VALUES (v_code, king_rand_digit(), king_rand_digit(), king_rand_digit())
      ON CONFLICT (session_code) DO NOTHING;
    END IF;
  END LOOP;
  FOR i IN 0..1 LOOP
    v_b   := v_last - (i * interval '5 min');
    v_code := to_char(v_b AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM king_results WHERE session_code = v_code) THEN
      SELECT d1, d2, d3, true INTO v_pd1, v_pd2, v_pd3, v_has_plan
        FROM king_planned WHERE session_code = v_code;
      IF v_has_plan IS TRUE THEN
        PERFORM settle_session(v_code, v_pd1, v_pd2, v_pd3);
      ELSE
        PERFORM settle_session(v_code, king_rand_digit(), king_rand_digit(), king_rand_digit());
      END IF;
    END IF;
  END LOOP;
  INSERT INTO metrics (metric_name, metric_value, tags)
  VALUES ('king_engine_tick_count', COALESCE(
    (SELECT metric_value + 1 FROM metrics WHERE metric_name = 'king_engine_tick_count' ORDER BY recorded_at DESC LIMIT 1), 1
  ), jsonb_build_object('ticked_at', v_now));
END;
$$;
REVOKE EXECUTE ON FUNCTION king_engine_tick() FROM anon, authenticated, public;

-- 5. Restore original engine_status view
CREATE OR REPLACE VIEW engine_status AS
WITH latest AS (
  SELECT MAX(created_at) as last_result FROM king_results
)
SELECT
  (SELECT last_result FROM latest) as last_settlement,
  (SELECT MAX(updated_at) FROM king_planned) as last_plan_generated,
  NULL::TIMESTAMP as last_watchdog,
  NULL::DECIMAL as result_age_sec,
  CASE
    WHEN (SELECT last_result FROM latest) IS NULL THEN 'NO_RESULTS'
    WHEN (SELECT EXTRACT(EPOCH FROM (NOW() - (SELECT last_result FROM latest)))) > 420 THEN 'STALLED'
    ELSE 'RUNNING'
  END as engine_status;

COMMIT;
