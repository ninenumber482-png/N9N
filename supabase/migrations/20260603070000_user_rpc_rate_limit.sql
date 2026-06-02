-- NUMBER9 — Rate limiting untuk user RPCs (place_bet, submit_withdrawal)
--
-- Mencegah abuse: max 30 calls per 60 detik per user per RPC
-- Menggunakan advisory lock + sliding window counter

BEGIN;

-- =============================================================================
-- 1. Rate limit function (digunakan oleh semua RPC yang perlu throttle)
-- =============================================================================
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_action  TEXT,        -- 'PLACE_BET' | 'SUBMIT_WITHDRAWAL'
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
  -- Cleanup expired entries
  DELETE FROM user_rate_limits WHERE created_at < v_cutoff AND user_id = p_user_id;

  -- Count recent actions
  SELECT COUNT(*) INTO v_count
    FROM user_rate_limits
   WHERE user_id = p_user_id
     AND action = p_action
     AND created_at > v_cutoff;

  IF v_count >= p_max THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many % requests. Try again later.', p_action;
  END IF;

  -- Log this action
  INSERT INTO user_rate_limits (user_id, action) VALUES (p_user_id, p_action);
END;
$$;

REVOKE EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, INT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, INT, INT) TO service_role;

-- =============================================================================
-- 2. Rate limit table (auto-cleanup via trigger atau delete on read)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_rate_limits (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL,
  action     TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup
  ON user_rate_limits (user_id, action, created_at DESC);

-- =============================================================================
-- 3. Add rate limit calls to place_bet
-- =============================================================================
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

-- =============================================================================
-- 4. Add rate limit calls to submit_withdrawal
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
  v_tx JSONB;
  v_session_token TEXT;
  v_actual_user_id UUID;
  v_locked_remaining DECIMAL(12,2);
BEGIN
  PERFORM check_rate_limit(p_user_id, 'SUBMIT_WITHDRAWAL', 10, 60000);

  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NOT NULL THEN
    SELECT id INTO v_actual_user_id FROM users
      WHERE session_token = v_session_token AND session_expires_at > NOW();
    IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  PERFORM 1 FROM deposit_locks WHERE user_id = p_user_id AND turnover_applied < turnover_required FOR UPDATE;
  SELECT COALESCE(SUM(turnover_required - turnover_applied), 0) INTO v_locked_remaining
    FROM deposit_locks WHERE user_id = p_user_id AND turnover_applied < turnover_required;
  IF v_locked_remaining > 0 THEN RAISE EXCEPTION 'TURNOVER_NOT_MET: % remaining', v_locked_remaining; END IF;

  UPDATE wallet SET balance_main = balance_main - p_amount, updated_at = NOW() WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount, status, method, bank_name, bank_account_number, bank_account_name, idempotency_key)
  VALUES (p_user_id, 'WITHDRAWAL', p_amount, 'PENDING', p_method, p_bank_name, p_bank_account_number, p_bank_account_name, p_idempotency_key)
  RETURNING jsonb_build_object('id', id, 'created_at', created_at, 'amount', amount, 'status', status) INTO v_tx;

  RETURN v_tx;
END;
$$;
REVOKE EXECUTE ON FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM anon;
GRANT EXECUTE ON FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated, service_role;

COMMIT;
