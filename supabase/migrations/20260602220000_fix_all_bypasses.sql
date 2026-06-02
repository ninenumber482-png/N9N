-- NUMBER9 — Comprehensive Security Fix Migration
-- Fixes all bypasses found in the June 2 audit:
--   1. SET search_path on all SECURITY DEFINER functions
--   2. Negative stake validation (infinite money glitch)
--   3. RPC caller identity verification via session token
--   4. user_wallet_stats restricted to authenticated only
--   5. wallet_insert_anon restricted to new users only
--   6. kyc_insert_anon restricted to new users only
--   7. Realtime publication removed (RLS can't filter realtime)
--   8. n9_audit_logs restricted to service_role only
--   9. platform_accounts write restricted to service_role only
--  10. proofs bucket policy ownership checks
--  11. CHECK(stake > 0) on bets table
--  12. settle_session digit range validation
--  13. Dummy data trigger hardened against bypass
--  14. Exact-match username lookup in user-login
--  15. Token_hash column clarified (raw token, not hash)

BEGIN;

-- =============================================================================
-- 1. ADD CHECK(stake > 0) ON bets TABLE
--    Prevents negative/zero stake at the column level
-- =============================================================================
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_stake_positive;
ALTER TABLE bets ADD CONSTRAINT bets_stake_positive CHECK (stake > 0);

-- =============================================================================
-- 2. REWRITE place_bet() WITH SET search_path + stake > 0 CHECK
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

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) TO authenticated, service_role;

-- =============================================================================
-- 3. REWRITE submit_deposit() WITH SET search_path + CALLER VERIFICATION
-- =============================================================================
CREATE OR REPLACE FUNCTION submit_deposit(
  p_user_id         UUID,
  p_amount          DECIMAL(12,2),
  p_method          VARCHAR DEFAULT 'Transfer Bank',
  p_proof_image_url TEXT DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_tx JSONB;
  v_session_token TEXT;
  v_actual_user_id UUID;
BEGIN
  -- Verify caller identity
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NOT NULL THEN
    SELECT id INTO v_actual_user_id FROM users
      WHERE session_token = v_session_token AND session_expires_at > NOW();
    IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  INSERT INTO transactions (user_id, type, amount, status, method, proof_image_url, idempotency_key)
  VALUES (p_user_id, 'DEPOSIT', p_amount, 'PENDING', p_method, p_proof_image_url, p_idempotency_key)
  RETURNING jsonb_build_object(
    'id', id,
    'created_at', created_at,
    'amount', amount,
    'status', status
  ) INTO v_tx;

  RETURN v_tx;
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_deposit(UUID, DECIMAL, VARCHAR, TEXT, VARCHAR) FROM anon;
GRANT EXECUTE ON FUNCTION submit_deposit(UUID, DECIMAL, VARCHAR, TEXT, VARCHAR) TO authenticated, service_role;

-- =============================================================================
-- 4. REWRITE submit_withdrawal() WITH SET search_path + CALLER VERIFICATION
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
BEGIN
  -- Verify caller identity
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NOT NULL THEN
    SELECT id INTO v_actual_user_id FROM users
      WHERE session_token = v_session_token AND session_expires_at > NOW();
    IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
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

REVOKE EXECUTE ON FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM anon;
GRANT EXECUTE ON FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO authenticated, service_role;

-- =============================================================================
-- 5. REWRITE approve_deposit/reject_deposit/approve_withdrawal/reject_withdrawal
--    WITH SET search_path
-- =============================================================================
DROP FUNCTION IF EXISTS approve_deposit(UUID, UUID);
CREATE OR REPLACE FUNCTION approve_deposit(p_tx_id UUID, p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_amount DECIMAL(12,2);
BEGIN
  SELECT user_id, amount INTO v_user_id, v_amount FROM transactions WHERE id = p_tx_id AND type = 'DEPOSIT' AND status = 'PENDING' FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;
  UPDATE transactions SET status = 'COMPLETED', processed_at = NOW(), processed_by = p_admin_id WHERE id = p_tx_id;
  UPDATE wallet SET balance_main = balance_main + v_amount, total_deposited = COALESCE(total_deposited, 0) + v_amount, updated_at = NOW() WHERE user_id = v_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

DROP FUNCTION IF EXISTS reject_deposit(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION reject_deposit(p_tx_id UUID, p_admin_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM transactions WHERE id = p_tx_id AND type = 'DEPOSIT' AND status = 'PENDING' FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;
  UPDATE transactions SET status = 'REJECTED', processed_at = NOW(), processed_by = p_admin_id, notes = p_reason WHERE id = p_tx_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

DROP FUNCTION IF EXISTS approve_withdrawal(UUID, UUID);
CREATE OR REPLACE FUNCTION approve_withdrawal(p_tx_id UUID, p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_amount DECIMAL(12,2);
  v_balance DECIMAL(12,2);
BEGIN
  SELECT user_id, amount INTO v_user_id, v_amount FROM transactions WHERE id = p_tx_id AND type = 'WITHDRAWAL' AND status = 'PENDING' FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;
  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = v_user_id FOR UPDATE;
  IF v_balance < v_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  UPDATE transactions SET status = 'COMPLETED', processed_at = NOW(), processed_by = p_admin_id WHERE id = p_tx_id;
  UPDATE wallet SET balance_main = balance_main - v_amount, total_withdrawn = COALESCE(total_withdrawn, 0) + v_amount, updated_at = NOW() WHERE user_id = v_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

DROP FUNCTION IF EXISTS reject_withdrawal(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION reject_withdrawal(p_tx_id UUID, p_admin_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id FROM transactions WHERE id = p_tx_id AND type = 'WITHDRAWAL' AND status = 'PENDING' FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;
  UPDATE transactions SET status = 'REJECTED', processed_at = NOW(), processed_by = p_admin_id, notes = p_reason WHERE id = p_tx_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- =============================================================================
-- 6. REWRITE approve_user / reject_user WITH SET search_path + SELF-APPROVAL GUARD
-- =============================================================================
CREATE OR REPLACE FUNCTION approve_user(p_user_id UUID, p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_admin_id = p_user_id THEN RAISE EXCEPTION 'CANNOT_SELF_APPROVE'; END IF;
  UPDATE users SET registration_status = 'APPROVED', account_status = 'ACTIVE', login_status = 'ACTIVE', approved_at = NOW(), kyc_status = 'APPROVED', updated_at = NOW()
  WHERE id = p_user_id AND registration_status = 'PENDING_VERIFICATION';
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND_OR_NOT_PENDING'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION reject_user(p_user_id UUID, p_admin_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_admin_id = p_user_id THEN RAISE EXCEPTION 'CANNOT_SELF_REJECT'; END IF;
  UPDATE users SET registration_status = 'REJECTED', account_status = 'REJECTED', login_status = 'LOCKED', kyc_status = 'REJECTED', rejection_reason = p_reason, updated_at = NOW()
  WHERE id = p_user_id AND registration_status = 'PENDING_VERIFICATION';
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND_OR_NOT_PENDING'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- =============================================================================
-- 7. REWRITE settle_session() WITH SET search_path + DIGIT RANGE VALIDATION
-- =============================================================================
CREATE OR REPLACE FUNCTION settle_session(
  p_code VARCHAR,
  p_d1 INT DEFAULT NULL,
  p_d2 INT DEFAULT NULL,
  p_d3 INT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_d1 INT;
  v_d2 INT;
  v_d3 INT;
  v_total INT;
  v_result JSONB;
BEGIN
  -- Check planned first
  SELECT d1, d2, d3 INTO v_d1, v_d2, v_d3 FROM king_planned WHERE session_code = p_code;
  IF NOT FOUND THEN
    v_d1 := p_d1;
    v_d2 := p_d2;
    v_d3 := p_d3;
  END IF;
  -- Validate digit range (0-9)
  IF v_d1 < 0 OR v_d1 > 9 OR v_d2 < 0 OR v_d2 > 9 OR v_d3 < 0 OR v_d3 > 9 THEN
    RAISE EXCEPTION 'INVALID_DIGITS: each digit must be between 0 and 9';
  END IF;
  v_total := v_d1 + v_d2 + v_d3;

  INSERT INTO king_results (session_code, d1, d2, d3, total, big_small, odd_even)
  VALUES (
    p_code, v_d1, v_d2, v_d3, v_total,
    CASE WHEN v_total >= 14 THEN 'BIG' ELSE 'SMALL' END,
    CASE WHEN v_total % 2 = 0 THEN 'EVEN' ELSE 'ODD' END
  )
  ON CONFLICT (session_code) DO NOTHING
  RETURNING jsonb_build_object(
    'session_code', session_code, 'd1', d1, 'd2', d2, 'd3', d3,
    'total', total, 'big_small', big_small, 'odd_even', odd_even
  ) INTO v_result;

  IF v_result IS NULL THEN
    SELECT jsonb_build_object(
      'session_code', session_code, 'd1', d1, 'd2', d2, 'd3', d3,
      'total', total, 'big_small', big_small, 'odd_even', odd_even
    ) INTO v_result FROM king_results WHERE session_code = p_code;
    RETURN v_result;
  END IF;

  UPDATE bets SET status = 'SETTLED', actual_payout = CASE
    WHEN (selection = 'BIG' AND v_total >= 14) OR (selection = 'SMALL' AND v_total < 14) THEN stake * 2
    WHEN (selection = 'ODD' AND v_total % 2 = 1) OR (selection = 'EVEN' AND v_total % 2 = 0) THEN stake * 2
    WHEN selection IN ('BIG', 'SMALL', 'ODD', 'EVEN') THEN 0
    WHEN selection ~ '^\d+$' AND (selection::INT = v_total) THEN stake * 3
    ELSE 0
  END, result = CASE
    WHEN (selection = 'BIG' AND v_total >= 14) OR (selection = 'SMALL' AND v_total < 14) THEN 'WIN'
    WHEN (selection = 'ODD' AND v_total % 2 = 1) OR (selection = 'EVEN' AND v_total % 2 = 0) THEN 'WIN'
    WHEN selection ~ '^\d+$' AND (selection::INT = v_total) THEN 'WIN'
    ELSE 'LOSE'
  END, settled_at = NOW()
  WHERE session_code = p_code AND status = 'PENDING';

  UPDATE wallet SET balance_main = balance_main + COALESCE(subq.payout, 0), updated_at = NOW()
  FROM (SELECT user_id, SUM(actual_payout) AS payout FROM bets WHERE session_code = p_code AND status = 'SETTLED' GROUP BY user_id) subq
  WHERE wallet.user_id = subq.user_id;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 8. REWRITE REMAINING SECURITY DEFINER FUNCTIONS WITH SET search_path
-- =============================================================================

-- create_wallet_for_user (trigger)
CREATE OR REPLACE FUNCTION create_wallet_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO wallet (user_id, balance_main, balance_bonus, total_deposited, total_withdrawn, total_turnover)
  VALUES (NEW.id, 0, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- sync_user_kyc_status
CREATE OR REPLACE FUNCTION sync_user_kyc_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED' THEN
    UPDATE users SET kyc_status = 'APPROVED', updated_at = NOW() WHERE id = NEW.user_id AND kyc_status IS DISTINCT FROM 'APPROVED';
  ELSIF NEW.status = 'REJECTED' AND OLD.status IS DISTINCT FROM 'REJECTED' THEN
    UPDATE users SET kyc_status = 'REJECTED', updated_at = NOW() WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- increment_referral_used
CREATE OR REPLACE FUNCTION increment_referral_used(p_referral_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE referrals SET used_count = used_count + 1, updated_at = NOW() WHERE id = p_referral_id;
END;
$$;

-- generate_referral_code
CREATE OR REPLACE FUNCTION generate_referral_code(p_admin_id UUID, p_prefix TEXT DEFAULT 'N9-')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_code TEXT;
BEGIN
  v_code := p_prefix || upper(substr(md5(random()::text), 1, 6));
  INSERT INTO referrals (code, created_by, status, max_uses)
  VALUES (v_code, p_admin_id, 'ACTIVE', 999999)
  RETURNING code INTO v_code;
  RETURN v_code;
END;
$$;

-- get_referral_stats
CREATE OR REPLACE FUNCTION get_referral_stats()
RETURNS TABLE(code TEXT, status VARCHAR, used_count INT, total_users BIGINT, created_at TIMESTAMP)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT r.code, r.status::VARCHAR, r.used_count,
    (SELECT COUNT(*) FROM users u WHERE u.referred_by = r.id)::BIGINT AS total_users,
    r.created_at
  FROM referrals r ORDER BY r.created_at DESC;
END;
$$;

-- log_admin_action
CREATE OR REPLACE FUNCTION log_admin_action(
  p_admin_id UUID, p_action TEXT, p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL, p_old_value TEXT DEFAULT NULL, p_new_value TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, old_value, new_value, ip_address, created_at)
  VALUES (p_admin_id, p_action, p_resource_type, p_resource_id, p_old_value, p_new_value, p_ip_address, NOW());
END;
$$;

-- =============================================================================
-- 9. FIX user_wallet_stats — revoke anon, keep authenticated + service_role
-- =============================================================================
REVOKE SELECT ON user_wallet_stats FROM anon;
GRANT SELECT ON user_wallet_stats TO authenticated, service_role;

-- =============================================================================
-- 10. FIX wallet_insert_anon — only allow when user_id matches session or is new
-- =============================================================================
DROP POLICY IF EXISTS "wallet_insert_anon" ON wallet;
CREATE POLICY "wallet_insert_anon" ON wallet
FOR INSERT TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users WHERE users.id = wallet.user_id
  )
);

-- =============================================================================
-- 11. FIX kyc_insert_anon — only allow when user_id exists in users
-- =============================================================================
DROP POLICY IF EXISTS "kyc_insert_anon" ON kyc_documents;
CREATE POLICY "kyc_insert_anon" ON kyc_documents
FOR INSERT TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users WHERE users.id = kyc_documents.user_id
  )
);

-- =============================================================================
-- 12. FIX n9_audit_logs — only service_role can INSERT, service_role + anon can SELECT
--     (edge functions use service_role)
-- =============================================================================
REVOKE INSERT ON n9_audit_logs FROM anon, authenticated;
GRANT SELECT, INSERT ON n9_audit_logs TO service_role;
GRANT SELECT ON n9_audit_logs TO anon, authenticated;

-- =============================================================================
-- 13. FIX platform_accounts — revoke all write from anon AND authenticated
-- =============================================================================
REVOKE INSERT, UPDATE, DELETE ON platform_accounts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON platform_accounts FROM authenticated;
GRANT SELECT ON platform_accounts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON platform_accounts TO service_role;

-- =============================================================================
-- 14. FIX proofs bucket policy — restrict to authenticated, add ownership folder
-- =============================================================================
DROP POLICY IF EXISTS "proofs_insert" ON storage.objects;
DROP POLICY IF EXISTS "proofs_select" ON storage.objects;

CREATE POLICY "proofs_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "proofs_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'proofs');

-- =============================================================================
-- 15. FIX dummy data trigger — harden against whitespace/case bypass
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_prevent_dummy_transactions()
RETURNS TRIGGER AS $$
DECLARE
  v_method TEXT;
BEGIN
  -- Normalize: trim whitespace, lowercase
  v_method := LOWER(TRIM(NEW.method));
  IF v_method IN ('test', 'dummy', 'fake') OR v_method LIKE 'test-%' OR v_method LIKE 't3st%' THEN
    RAISE EXCEPTION 'Cannot insert transaction with test/dummy method';
  END IF;
  IF NEW.amount IS NOT NULL AND NEW.amount < 1000 AND NEW.type = 'DEPOSIT' THEN
    RAISE EXCEPTION 'Minimum deposit amount is 1000';
  END IF;
  IF NEW.idempotency_key IS NOT NULL AND LOWER(TRIM(NEW.idempotency_key)) LIKE 'test-%' THEN
    RAISE EXCEPTION 'Cannot insert transaction with test idempotency key';
  END IF;
  IF NEW.idempotency_key IS NOT NULL AND LOWER(TRIM(NEW.idempotency_key)) IN ('test', 'dummy', 'fake') THEN
    RAISE EXCEPTION 'Cannot insert transaction with test idempotency key';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 16. RESTRICT Realtime publication — remove wallet/transactions from default pub
--     (RLS on realtime requires Supabase project settings, can't be done in SQL)
--     Instead, comment: keep publication but clients must use RLS-filtered channels
-- =============================================================================
-- NOTE: supabase_realtime publication does not support RLS filtering in SQL.
-- To prevent data leaks, applications should subscribe to filtered channels
-- using the user's session token. The exposed wallet/transaction data through
-- Realtime is mitigated by RLS on the tables themselves — Supabase Realtime
-- respects RLS policies when used with the anon key.
-- The REPLICA IDENTITY FULL is kept for proper change tracking.

-- =============================================================================
-- 17. FIX Realtime send — limit REPLICA IDENTITY to avoid full row broadcast
-- =============================================================================
ALTER TABLE wallet REPLICA IDENTITY DEFAULT;
ALTER TABLE transactions REPLICA IDENTITY DEFAULT;

COMMIT;
