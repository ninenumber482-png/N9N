-- NUMBER9 — Hash all session tokens with SHA-256 before storage
--
-- Problem: session_token (users) and token_hash (sessions) store raw 64-char
-- hex tokens. A DB leak exposes all active sessions, allowing token theft.
--
-- Fix:
--   1. Enable pgcrypto extension (for digest() function)
--   2. Hash existing tokens in users.session_token and sessions.token_hash
--   3. Recreate ALL RPC functions to compare hashed tokens
--   4. Recreate ALL RLS policies to compare hashed tokens
--
-- WARNING: This migration MUST be deployed BEFORE the corresponding Edge
-- Function changes (user-login, auth-login, admin-proxy) to ensure
-- existing tokens are hashed before the new validation code runs.

BEGIN;

-- =============================================================================
-- 0. ENABLE pgcrypto extension
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- =============================================================================
-- 1. HASH existing session tokens
-- =============================================================================

-- Hash all active user session tokens
UPDATE users
  SET session_token = encode(digest(session_token, 'sha256'), 'hex')
  WHERE session_token IS NOT NULL;

-- Hash all active session records
UPDATE sessions
  SET token_hash = encode(digest(token_hash, 'sha256'), 'hex')
  WHERE token_hash IS NOT NULL AND logged_out_at IS NULL;

-- =============================================================================
-- 2. DROP existing POLICIES before recreating
-- =============================================================================

-- From 20260602090000_user_session_rls.sql
DROP POLICY IF EXISTS "wallet_own" ON wallet;
DROP POLICY IF EXISTS "transactions_own" ON transactions;
DROP POLICY IF EXISTS "bets_own" ON bets;
DROP POLICY IF EXISTS "kyc_own" ON kyc_documents;
DROP POLICY IF EXISTS "kyc_update_own" ON kyc_documents;
DROP POLICY IF EXISTS "kyc_delete_own" ON kyc_documents;

-- From 20260604140000_critical_security_fixes.sql
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "sessions_select_own" ON sessions;

-- =============================================================================
-- 3. RECREATE POLICIES with hashed token comparison
--    Changes: `= current_setting(...)` → `= encode(digest(current_setting(...), 'sha256'), 'hex')`
-- =============================================================================

-- Wallet: user can only access their own row via valid session token (hashed)
CREATE POLICY "wallet_own" ON wallet
FOR ALL TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = wallet.user_id
      AND users.session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
      AND users.session_expires_at > NOW()
  )
);

-- Transactions: user can only access their own row via valid session token (hashed)
CREATE POLICY "transactions_own" ON transactions
FOR ALL TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = transactions.user_id
      AND users.session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
      AND users.session_expires_at > NOW()
  )
);

-- Bets: user can only access their own row via valid session token (hashed)
CREATE POLICY "bets_own" ON bets
FOR ALL TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = bets.user_id
      AND users.session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
      AND users.session_expires_at > NOW()
  )
);

-- KYC Documents: user can only read/update/delete their own row (hashed)
CREATE POLICY "kyc_own" ON kyc_documents
FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = kyc_documents.user_id
      AND users.session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
      AND users.session_expires_at > NOW()
  )
);

CREATE POLICY "kyc_update_own" ON kyc_documents
FOR UPDATE TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = kyc_documents.user_id
      AND users.session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
      AND users.session_expires_at > NOW()
  )
);

CREATE POLICY "kyc_delete_own" ON kyc_documents
FOR DELETE TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = kyc_documents.user_id
      AND users.session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
      AND users.session_expires_at > NOW()
  )
);

-- Users SELECT own row policy (hashed)
CREATE POLICY "users_select_own" ON users
FOR SELECT TO anon
USING (
  session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
  AND session_expires_at > NOW()
);

-- Users UPDATE own row policy (hashed)
CREATE POLICY "users_update_own" ON users
FOR UPDATE TO anon
USING (
  session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
  AND session_expires_at > NOW()
)
WITH CHECK (
  session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
  AND session_expires_at > NOW()
);

-- Sessions SELECT own policy (hashed)
CREATE POLICY "sessions_select_own" ON sessions
FOR SELECT TO anon
USING (
  user_id IN (
    SELECT id FROM users
    WHERE session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
    AND session_expires_at > NOW()
  )
);

-- =============================================================================
-- 4. RECREATE ALL affected RPC FUNCTIONS with hashed token comparison
--    Change pattern: `WHERE session_token = v_session_token`
--                → `WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex')`
-- =============================================================================

-- -------------------------------------------------------------------------
-- 4a. submit_deposit (from 20260604140000_critical_security_fixes.sql)
-- -------------------------------------------------------------------------
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
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT id INTO v_actual_user_id FROM users
    WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex') AND session_expires_at > NOW();
  IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  INSERT INTO transactions (user_id, type, amount, status, method, proof_image_url, idempotency_key)
  VALUES (p_user_id, 'DEPOSIT', p_amount, 'PENDING', p_method, p_proof_image_url, p_idempotency_key)
  RETURNING jsonb_build_object('id', id, 'created_at', created_at, 'amount', amount, 'status', status) INTO v_tx;

  RETURN v_tx;
END;
$$;

-- -------------------------------------------------------------------------
-- 4b. submit_withdrawal (from 20260604140000_critical_security_fixes.sql)
-- -------------------------------------------------------------------------
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
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT id INTO v_actual_user_id FROM users
    WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex') AND session_expires_at > NOW();
  IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  INSERT INTO transactions (user_id, type, amount, status, method, bank_name, bank_account_number, bank_account_name, idempotency_key)
  VALUES (p_user_id, 'WITHDRAWAL', p_amount, 'PENDING', p_method, p_bank_name, p_bank_account_number, p_bank_account_name, p_idempotency_key)
  RETURNING jsonb_build_object('id', id, 'created_at', created_at, 'amount', amount, 'status', status) INTO v_tx;

  RETURN v_tx;
END;
$$;

-- -------------------------------------------------------------------------
-- 4c. session_heartbeat (from 20260604120000_fingerprint_and_online_status.sql)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION session_heartbeat(p_fingerprint TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_session_token TEXT;
BEGIN
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RETURN; END IF;

  SELECT id INTO v_user_id FROM users
    WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex') AND session_expires_at > NOW();
  IF v_user_id IS NULL THEN RETURN; END IF;

  PERFORM update_session_heartbeat(v_user_id, p_fingerprint);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------------------------
-- 4d. place_bet (latest version from 20260603233000_fix_referral_stats_and_place_bet.sql)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_bet(
  p_user_id uuid,
  p_session_code character varying,
  p_selections jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total   DECIMAL(12,2);
  v_balance DECIMAL(12,2);
  v_count   INTEGER;
  v_lock_rows INTEGER;
  v_session_token TEXT;
  v_actual_user_id UUID;
BEGIN
  PERFORM check_rate_limit(p_user_id, 'PLACE_BET', 30, 60000);

  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT id INTO v_actual_user_id FROM users
    WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex') AND session_expires_at > NOW();
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

  UPDATE wallet
     SET balance_main = balance_main - v_total,
         total_turnover = total_turnover + v_total,
         updated_at = NOW()
   WHERE user_id = p_user_id;

  WITH locked AS (
    SELECT id, turnover_required, turnover_applied
      FROM deposit_locks
     WHERE user_id = p_user_id
       AND turnover_applied < turnover_required
     ORDER BY created_at ASC
     FOR UPDATE
  ),
  cumulative AS (
    SELECT id,
           turnover_required,
           turnover_applied,
           LEAST(v_total, SUM(turnover_required - turnover_applied) OVER (ORDER BY created_at)) AS total_to_apply
      FROM locked
  ),
  applied AS (
    UPDATE deposit_locks d
       SET turnover_applied = d.turnover_applied +
           LEAST(d.turnover_required - d.turnover_applied,
                 c.total_to_apply - COALESCE(SUM(d2.turnover_required - d2.turnover_applied)
                       FILTER (WHERE d2.created_at < d.created_at), 0))
      FROM cumulative c
      LEFT JOIN deposit_locks d2 ON d2.user_id = p_user_id
        AND d2.turnover_applied < d2.turnover_required
        AND d2.created_at < c.created_at
     WHERE d.id = c.id
       AND c.total_to_apply > 0
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_lock_rows FROM applied;

  RETURN v_count;
END;
$function$;

-- -------------------------------------------------------------------------
-- 4e. get_my_kyc_documents (from 20260603235500_create_kyc_rpc.sql)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_kyc_documents()
RETURNS TABLE (
  id UUID,
  document_type VARCHAR,
  document_url TEXT,
  status VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_token TEXT;
BEGIN
  v_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT id INTO v_user_id FROM users
    WHERE session_token = encode(digest(v_token, 'sha256'), 'hex');
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  RETURN QUERY
    SELECT k.id, k.document_type, k.document_url, k.status, k.created_at, k.updated_at
    FROM kyc_documents k
    WHERE k.user_id = v_user_id
    ORDER BY k.created_at DESC;
END;
$$;

-- -------------------------------------------------------------------------
-- 4f. get_current_user_id_for_kyc (from 20260603235000_fix_kyc_rls_performance.sql)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_current_user_id_for_kyc()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_token TEXT;
BEGIN
  v_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_token IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_user_id FROM users
    WHERE session_token = encode(digest(v_token, 'sha256'), 'hex');
  RETURN v_user_id;
END;
$$;

-- =============================================================================
-- 5. RECREATE functions from migrations that have been superseded by later
--    versions but still contain session_token comparison logic.
--    These are the current "latest" versions that replace older definitions.
-- =============================================================================

-- -------------------------------------------------------------------------
-- 5a. submit_withdrawal — atomic deduction (from 20260604170000_restore_withdrawal_atomic_deduction.sql)
--      This is the latest version combining turnover + atomic deduction + rate limit.
-- -------------------------------------------------------------------------
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
  IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT id INTO v_actual_user_id FROM users
    WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex') AND session_expires_at > NOW();
  IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

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

-- =============================================================================
-- 6. REVOKE/GRANT permissions — unchanged from latest migrations
-- =============================================================================

-- place_bet permission
REVOKE EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) TO anon, authenticated, service_role;

-- submit_deposit permission
REVOKE EXECUTE ON FUNCTION submit_deposit(UUID, DECIMAL, VARCHAR, TEXT, VARCHAR) FROM anon;
GRANT EXECUTE ON FUNCTION submit_deposit(UUID, DECIMAL, VARCHAR, TEXT, VARCHAR) TO anon, authenticated, service_role;

-- submit_withdrawal permission
REVOKE EXECUTE ON FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM anon;
GRANT EXECUTE ON FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated, service_role;

-- =============================================================================
-- 7. Verify — ANALYZE to update stats for hashed token index
-- =============================================================================
ANALYZE users;
ANALYZE sessions;

COMMIT;
