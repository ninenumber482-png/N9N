-- NUMBER9 — Critical Security Fixes (June 4, 2026)
-- Fixes: token bypass in RPCs, users RLS, platform_config policy, session invalidation

BEGIN;

-- =============================================================================
-- 1. FIX submit_deposit() — REMOVE token bypass
--    Current: IF v_session_token IS NOT NULL THEN ... (skips check when no header)
--    Fixed: ALWAYS require token
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
  -- Verify caller identity — ALWAYS required (no bypass)
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

-- =============================================================================
-- 2. FIX submit_withdrawal() — REMOVE token bypass
--    Current: IF v_session_token IS NOT NULL THEN ... (skips check when no header)
--    Fixed: ALWAYS require token
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
  -- Verify caller identity — ALWAYS required (no bypass)
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

-- =============================================================================
-- 3. ENABLE RLS ON users TABLE — protect password_hash, session_token, etc.
--    Uses session token for own-row access; admin-proxy uses service_role (bypasses RLS)
-- =============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can only SELECT their own row (via session token)
DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own" ON users
FOR SELECT TO anon
USING (
  session_token = current_setting('request.headers', true)::json->>'x-user-token'
  AND session_expires_at > NOW()
);

-- Users can UPDATE their own row (limited columns enforced in application layer)
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
FOR UPDATE TO anon
USING (
  session_token = current_setting('request.headers', true)::json->>'x-user-token'
  AND session_expires_at > NOW()
)
WITH CHECK (
  session_token = current_setting('request.headers', true)::json->>'x-user-token'
  AND session_expires_at > NOW()
);

-- INSERT allowed for registration (anon creates new user)
DROP POLICY IF EXISTS "users_insert_registration" ON users;
CREATE POLICY "users_insert_registration" ON users
FOR INSERT TO anon
WITH CHECK (true);

-- =============================================================================
-- 4. ENABLE RLS ON sessions TABLE — protect session tokens, IPs
-- =============================================================================
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Users can only SELECT their own sessions
DROP POLICY IF EXISTS "sessions_select_own" ON sessions;
CREATE POLICY "sessions_select_own" ON sessions
FOR SELECT TO anon
USING (
  user_id IN (
    SELECT id FROM users
    WHERE session_token = current_setting('request.headers', true)::json->>'x-user-token'
    AND session_expires_at > NOW()
  )
);

-- =============================================================================
-- 5. FIX platform_config INSERT/UPDATE policies — admin-only via service_role
--    Current: WITH CHECK (true) = anyone can insert/modify config
--    Fixed: Only service_role can write (admin-proxy uses service_role)
-- =============================================================================
DROP POLICY IF EXISTS "platform_config_insert_service" ON platform_config;
CREATE POLICY "platform_config_insert_service" ON platform_config
FOR INSERT TO anon
WITH CHECK (false);

DROP POLICY IF EXISTS "platform_config_update_service" ON platform_config;
CREATE POLICY "platform_config_update_service" ON platform_config
FOR UPDATE TO anon
USING (false);

-- =============================================================================
-- 6. REVOKE dangerous table permissions from anon
-- =============================================================================
-- users: anon should not have blanket INSERT/UPDATE/DELETE (only via policies)
REVOKE ALL ON users FROM authenticated;
REVOKE ALL ON sessions FROM authenticated;

-- sessions: anon should not INSERT directly (only Edge Functions via service_role)
REVOKE INSERT, UPDATE, DELETE ON sessions FROM anon;

-- deposit_locks: no public write
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deposit_locks') THEN
    REVOKE INSERT, UPDATE, DELETE ON deposit_locks FROM anon;
  END IF;
END $$;

-- =============================================================================
-- 7. GRANT minimal permissions for registration flow
-- =============================================================================
-- Registration needs: INSERT users, INSERT wallet (via trigger), INSERT kyc_documents, INSERT sessions
-- place_bet needs: SELECT/UPDATE wallet, INSERT bets
-- Already handled by existing policies; this is a safety net
GRANT SELECT, INSERT ON users TO anon;
GRANT SELECT ON sessions TO anon;

COMMIT;
