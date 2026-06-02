-- Add user turnover tracking to wallet table
-- Turnover = cumulative sum of all bet stakes (wagered amount)

ALTER TABLE wallet
ADD COLUMN IF NOT EXISTS total_turnover DECIMAL(12,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS wallet_total_turnover_idx ON wallet(total_turnover DESC);

-- Auto-create wallet for new users
CREATE OR REPLACE FUNCTION create_wallet_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO wallet (user_id, balance_main, balance_bonus, total_deposited, total_withdrawn, total_turnover)
  VALUES (NEW.id, 0, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_wallet_on_user_insert ON users;
CREATE TRIGGER trg_create_wallet_on_user_insert
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION create_wallet_for_user();

-- Backfill wallets for existing users who don't have one
INSERT INTO wallet (user_id, balance_main, balance_bonus, total_deposited, total_withdrawn, total_turnover)
SELECT u.id, 0, 0, 0, 0, 0
FROM users u
LEFT JOIN wallet w ON w.user_id = u.id
WHERE w.id IS NULL;

-- Update place_bet() to increment total_turnover
CREATE OR REPLACE FUNCTION place_bet(
  p_user_id     UUID,
  p_session_code VARCHAR,
  p_selections  JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
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
         total_turnover = total_turnover + v_total,
         updated_at = NOW()
   WHERE user_id = p_user_id;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) TO anon, authenticated, service_role;

-- Create a view for user wallet stats (includes turnover)
CREATE OR REPLACE VIEW user_wallet_stats AS
SELECT
  w.user_id,
  u.username,
  u.display_name,
  w.balance_main,
  w.balance_bonus,
  w.total_deposited,
  w.total_withdrawn,
  w.total_turnover,
  COALESCE(w.total_deposited - w.total_withdrawn, 0) AS net_deposit,
  (w.balance_main + w.balance_bonus) AS total_balance,
  ROUND((w.balance_main + w.balance_bonus) / NULLIF(w.total_turnover, 0), 2) AS roi,
  COUNT(DISTINCT b.id) AS total_bets,
  COUNT(CASE WHEN b.result = 'WIN' THEN 1 END) AS win_count,
  COUNT(CASE WHEN b.result = 'LOSE' THEN 1 END) AS lose_count,
  ROUND(COUNT(CASE WHEN b.result = 'WIN' THEN 1 END)::DECIMAL / NULLIF(COUNT(DISTINCT b.id), 0) * 100, 2) AS win_rate,
  w.updated_at
FROM wallet w
LEFT JOIN users u ON w.user_id = u.id
LEFT JOIN bets b ON w.user_id = b.user_id AND b.status = 'SETTLED'
GROUP BY w.id, u.id, u.username, u.display_name;

GRANT SELECT ON user_wallet_stats TO anon, authenticated, service_role;
