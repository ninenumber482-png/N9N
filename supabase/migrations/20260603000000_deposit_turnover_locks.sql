-- NUMBER9 — Per-deposit turnover tracking via deposit_locks table
--
-- Each approved deposit gets a lock record requiring turnover.
-- Locks are released FIFO as the user places bets (turnover applied).
-- Withdrawal eligibility = no pending locks.

BEGIN;

-- =============================================================================
-- 1. CREATE deposit_locks TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS deposit_locks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  deposit_id      UUID REFERENCES transactions(id),
  amount          DECIMAL(12,2) NOT NULL,
  turnover_required DECIMAL(12,2) NOT NULL DEFAULT 0,
  turnover_applied DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE (deposit_id)
);

CREATE INDEX IF NOT EXISTS idx_deposit_locks_user ON deposit_locks(user_id);

-- =============================================================================
-- 2. MODIFY approve_deposit — create a lock for each approved deposit
-- =============================================================================
CREATE OR REPLACE FUNCTION approve_deposit(p_tx_id UUID, p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_amount DECIMAL(12,2);
  v_created_at TIMESTAMP;
BEGIN
  SELECT user_id, amount, created_at INTO v_user_id, v_amount, v_created_at
    FROM transactions WHERE id = p_tx_id AND type = 'DEPOSIT' AND status = 'PENDING' FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;

  UPDATE transactions SET status = 'COMPLETED', processed_at = NOW(), processed_by = p_admin_id WHERE id = p_tx_id;

  UPDATE wallet
     SET balance_main = balance_main + v_amount,
         total_deposited = COALESCE(total_deposited, 0) + v_amount,
         updated_at = NOW()
   WHERE user_id = v_user_id;

  -- Create per-deposit lock (1x turnover required)
  INSERT INTO deposit_locks (user_id, deposit_id, amount, turnover_required, turnover_applied, created_at)
  VALUES (v_user_id, p_tx_id, v_amount, v_amount, 0, v_created_at);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION approve_deposit(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION approve_deposit(UUID, UUID) TO authenticated, service_role;

-- =============================================================================
-- 3. MODIFY place_bet — apply turnover to earliest pending lock first (FIFO)
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
  -- Verify caller identity via session token
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  SELECT id INTO v_actual_user_id FROM users
    WHERE session_token = v_session_token AND session_expires_at > NOW();
  IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Validate stake > 0 for every selection
  SELECT COALESCE(SUM((s->>'stake')::DECIMAL), 0)
    INTO v_total
    FROM jsonb_array_elements(p_selections) AS s;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'INVALID_STAKE';
  END IF;

  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;
  IF v_balance < v_total THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  INSERT INTO bets (user_id, session_code, bet_code, selection, stake, potential_payout, status)
  SELECT
    p_user_id,
    p_session_code,
    s->>'bet_code',
    s->>'selection',
    (s->>'stake')::DECIMAL,
    (s->>'potential_payout')::DECIMAL,
    'PENDING'
  FROM jsonb_array_elements(p_selections) AS s;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE wallet
     SET balance_main = balance_main - v_total,
         total_turnover = total_turnover + v_total,
         updated_at = NOW()
   WHERE user_id = p_user_id;

  -- Apply turnover to pending deposit locks (FIFO by created_at)
  v_remaining := v_total;
  FOR v_lock IN
    SELECT id, turnover_required, turnover_applied
      FROM deposit_locks
     WHERE user_id = p_user_id
       AND (turnover_applied < turnover_required)
     ORDER BY created_at ASC
     FOR UPDATE
  LOOP
    IF v_remaining <= 0 THEN EXIT; END IF;
    DECLARE
      v_needed DECIMAL(12,2) := v_lock.turnover_required - v_lock.turnover_applied;
      v_apply DECIMAL(12,2);
    BEGIN
      v_apply := LEAST(v_needed, v_remaining);
      UPDATE deposit_locks
         SET turnover_applied = turnover_applied + v_apply
       WHERE id = v_lock.id;
      v_remaining := v_remaining - v_apply;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) TO authenticated, service_role;

COMMIT;
