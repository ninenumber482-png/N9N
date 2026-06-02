-- NUMBER9 — Demo identity + 3D King marketplace wiring
-- ----------------------------------------------------------------------------
-- The client runs in DEMO_MODE and logs in as `demo` (password handled
-- client-side). For the 3D King GamePage to persist real bets and debit a real
-- wallet, the demo account must exist in Postgres with a UUID-shaped id so that
-- bets.user_id (UUID NOT NULL REFERENCES users(id)) is satisfied.
--
-- Bet MECHANICS are unchanged from 3D King (BIG/SMALL, ODD/EVEN, NUMBER 0-27,
-- payouts 2x/2x/3x). No new tables: the existing `bets` and `wallet` tables
-- already model everything the marketplace needs.
-- ----------------------------------------------------------------------------

-- Demo user (real UUID so it can own bets) -----------------------------------
INSERT INTO users (
  id, username, password_hash, display_name, email, phone, country,
  role, account_status, registration_status, login_status,
  referral_code, kyc_status, created_at, approved_at
) VALUES (
  'a0000000-0000-0000-0000-000000000003',
  'demo',
  '$2b$12$9bfYtPyPPP.EdkFLh7ns8.KkpdZ9DZff0cjegYwN/6Fc.ww5c8wua',
  'Demo User',
  'demo@number9.local',
  '081234567890',
  'Indonesia',
  'user',
  'ACTIVE',
  'APPROVED',
  'ACTIVE',
  'N9-USER-DEMO',
  'APPROVED',
  NOW(),
  NOW()
)
ON CONFLICT (username) DO NOTHING;

-- Demo wallet ----------------------------------------------------------------
INSERT INTO wallet (
  user_id, balance_main, balance_bonus, total_deposited, total_withdrawn
) VALUES (
  'a0000000-0000-0000-0000-000000000003',
  35000.00,
  2500.00,
  50000.00,
  0.00
)
ON CONFLICT (user_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- place_bet(): atomic stake debit + bet insert.
-- Inserts one bet row per selection and debits the total stake from the
-- player's main wallet balance in a single transaction. Returns the number of
-- bet rows created. Raises if the wallet has insufficient funds.
--
-- `p_selections` is a JSON array of { bet_code, selection, stake, potential_payout }.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION place_bet(
  p_user_id     UUID,
  p_session_code VARCHAR,
  p_selections  JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_total   DECIMAL(12,2);
  v_balance DECIMAL(12,2);
  v_count   INTEGER;
BEGIN
  SELECT COALESCE(SUM((s->>'stake')::DECIMAL), 0)
    INTO v_total
    FROM jsonb_array_elements(p_selections) AS s;

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
         updated_at = NOW()
   WHERE user_id = p_user_id;

  RETURN v_count;
END;
$$;
