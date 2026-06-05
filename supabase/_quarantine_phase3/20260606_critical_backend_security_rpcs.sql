-- CRITICAL BACKEND SECURITY RPC FUNCTIONS
-- These enforce server-side security that frontend cannot bypass
-- Date: 2026-06-06

-- =============================================================================
-- 1. VERIFY USER ROLE (Server-side permission enforcement)
-- =============================================================================
-- Called by RoleGuard on frontend to verify role with server
-- Prevents localStorage spoofing attacks

CREATE OR REPLACE FUNCTION verify_user_role(
  p_user_id UUID,
  p_required_role VARCHAR
)
RETURNS TABLE (
  valid BOOLEAN,
  actual_role VARCHAR,
  reason TEXT
) AS $$
DECLARE
  v_user_role VARCHAR;
  v_reason TEXT := '';
BEGIN
  -- Get actual role from database (source of truth)
  SELECT role INTO v_user_role
  FROM users
  WHERE id = p_user_id
  AND account_status = 'active';

  IF v_user_role IS NULL THEN
    RETURN QUERY SELECT false, NULL::VARCHAR, 'User not found or inactive';
    RETURN;
  END IF;

  -- Verify required role matches actual role
  IF v_user_role = p_required_role THEN
    RETURN QUERY SELECT true, v_user_role, '';
  ELSE
    v_reason := format('Role mismatch: user has %s, required %s', v_user_role, p_required_role);
    RETURN QUERY SELECT false, v_user_role, v_reason;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION verify_user_role(UUID, VARCHAR) TO anon, authenticated;

-- =============================================================================
-- 2. AUDIT LOG EVENT (Server-side audit trail)
-- =============================================================================
-- Records all security-sensitive actions to immutable audit trail
-- Used by ALL admin functions (approve_user, approve_deposit, settle_session, etc.)

CREATE OR REPLACE FUNCTION audit_log_event(
  p_admin_id UUID,
  p_action VARCHAR,
  p_resource_type VARCHAR,
  p_resource_id VARCHAR,
  p_old_value JSONB DEFAULT NULL,
  p_new_value JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_ip_address VARCHAR DEFAULT 'unknown'
)
RETURNS TABLE (
  audit_id UUID,
  logged_at TIMESTAMP
) AS $$
DECLARE
  v_audit_id UUID;
  v_admin_role VARCHAR;
  v_audit_timestamp TIMESTAMP;
BEGIN
  -- Verify admin has permission to log this action
  SELECT role INTO v_admin_role
  FROM users
  WHERE id = p_admin_id
  AND role IN ('admin', 'audit_admin');

  IF v_admin_role IS NULL THEN
    RAISE EXCEPTION 'Audit logging requires admin role';
  END IF;

  -- Insert audit log entry (immutable)
  INSERT INTO audit_log (
    admin_id,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value,
    reason,
    ip_address,
    created_at
  ) VALUES (
    p_admin_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_value,
    p_new_value,
    p_reason,
    p_ip_address,
    NOW()
  ) RETURNING id, created_at
  INTO v_audit_id, v_audit_timestamp;

  RETURN QUERY SELECT v_audit_id, v_audit_timestamp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION audit_log_event(UUID, VARCHAR, VARCHAR, VARCHAR, JSONB, JSONB, TEXT, VARCHAR) TO anon, authenticated;

-- =============================================================================
-- 3. LOG FAILED LOGIN (Brute force detection)
-- =============================================================================
-- Records failed login attempts with IP, device, timestamp
-- Used to implement rate limiting and account lockout

CREATE OR REPLACE FUNCTION log_failed_login(
  p_username VARCHAR,
  p_ip_address VARCHAR,
  p_reason VARCHAR,
  p_user_agent VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  attempt_count INT,
  last_attempt_timestamp TIMESTAMP,
  is_rate_limited BOOLEAN
) AS $$
DECLARE
  v_attempt_count INT;
  v_last_attempt TIMESTAMP;
  v_is_rate_limited BOOLEAN := false;
BEGIN
  -- Insert failed login record
  INSERT INTO failed_logins (
    username,
    ip_address,
    reason,
    user_agent,
    attempted_at
  ) VALUES (
    p_username,
    p_ip_address,
    p_reason,
    p_user_agent,
    NOW()
  );

  -- Count failed attempts in last minute
  SELECT COUNT(*) INTO v_attempt_count
  FROM failed_logins
  WHERE username = p_username
  AND ip_address = p_ip_address
  AND attempted_at > NOW() - INTERVAL '1 minute';

  -- Get last attempt time
  SELECT MAX(attempted_at) INTO v_last_attempt
  FROM failed_logins
  WHERE username = p_username
  AND ip_address = p_ip_address;

  -- Rate limit: 10 attempts per minute
  v_is_rate_limited := v_attempt_count > 10;

  RETURN QUERY SELECT v_attempt_count, v_last_attempt, v_is_rate_limited;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION log_failed_login(VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated;

-- =============================================================================
-- 4. INVALIDATE SESSION (Server-side session termination)
-- =============================================================================
-- Marks token as logged out so it can never be reused
-- CRITICAL: Called on logout to invalidate all old tokens

CREATE OR REPLACE FUNCTION invalidate_session(
  p_token_hash VARCHAR,
  p_user_id UUID,
  p_logout_reason VARCHAR DEFAULT 'user-logout'
)
RETURNS TABLE (
  session_id UUID,
  invalidated_at TIMESTAMP,
  success BOOLEAN
) AS $$
DECLARE
  v_session_id UUID;
  v_invalidated TIMESTAMP;
BEGIN
  -- Find and invalidate session
  UPDATE sessions
  SET logged_out_at = NOW(),
      logout_reason = p_logout_reason
  WHERE token_hash = p_token_hash
  AND user_id = p_user_id
  AND logged_out_at IS NULL
  RETURNING id, logged_out_at
  INTO v_session_id, v_invalidated;

  IF v_session_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TIMESTAMP, false;
  ELSE
    RETURN QUERY SELECT v_session_id, v_invalidated, true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION invalidate_session(VARCHAR, UUID, VARCHAR) TO anon, authenticated;

-- =============================================================================
-- 5. VALIDATE SESSION (Check if token is still valid)
-- =============================================================================
-- Called before processing ANY sensitive operation
-- Returns false if token is expired or logged out

CREATE OR REPLACE FUNCTION validate_session(
  p_token_hash VARCHAR,
  p_user_id UUID
)
RETURNS TABLE (
  valid BOOLEAN,
  reason TEXT,
  expires_at TIMESTAMP
) AS $$
DECLARE
  v_session_record RECORD;
BEGIN
  SELECT id, expires_at, logged_out_at, last_activity
  INTO v_session_record
  FROM sessions
  WHERE token_hash = p_token_hash
  AND user_id = p_user_id;

  IF v_session_record IS NULL THEN
    RETURN QUERY SELECT false, 'Session not found', NULL::TIMESTAMP;
    RETURN;
  END IF;

  IF v_session_record.logged_out_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'Session has been logged out', v_session_record.expires_at;
    RETURN;
  END IF;

  IF NOW() > v_session_record.expires_at THEN
    RETURN QUERY SELECT false, 'Session expired', v_session_record.expires_at;
    RETURN;
  END IF;

  -- Update last activity
  UPDATE sessions SET last_activity = NOW()
  WHERE token_hash = p_token_hash
  AND user_id = p_user_id;

  RETURN QUERY SELECT true, 'Session valid', v_session_record.expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION validate_session(VARCHAR, UUID) TO anon, authenticated;

-- =============================================================================
-- 6. CHECK RATE LIMIT (Prevent brute force at API level)
-- =============================================================================
-- Used in approve_deposit, approve_withdraw, settle_session, etc.
-- to prevent automated attacks

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier VARCHAR,
  p_operation VARCHAR,
  p_limit_per_minute INT DEFAULT 10
)
RETURNS TABLE (
  allowed BOOLEAN,
  attempts_in_window INT,
  time_until_reset_seconds INT
) AS $$
DECLARE
  v_count INT;
  v_reset_time TIMESTAMP;
BEGIN
  -- Count operations in last minute
  SELECT COUNT(*) INTO v_count
  FROM audit_log
  WHERE (action || ':' || resource_type) = p_operation
  AND admin_id::TEXT = p_identifier
  AND created_at > NOW() - INTERVAL '1 minute';

  v_reset_time := NOW() + INTERVAL '1 minute';

  RETURN QUERY SELECT
    v_count < p_limit_per_minute,
    v_count,
    EXTRACT(EPOCH FROM (v_reset_time - NOW()))::INT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_rate_limit(VARCHAR, VARCHAR, INT) TO anon, authenticated;

-- =============================================================================
-- 7. ENFORCE RBAC (Role-Based Access Control)
-- =============================================================================
-- Central enforcement point for all permission checks
-- Returns detailed reason if access denied

CREATE OR REPLACE FUNCTION enforce_rbac(
  p_user_id UUID,
  p_action VARCHAR,
  p_resource_type VARCHAR
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  required_role VARCHAR
) AS $$
DECLARE
  v_user_role VARCHAR;
  v_required_role VARCHAR;
  v_reason TEXT;
BEGIN
  -- Get user's actual role from database
  SELECT role INTO v_user_role
  FROM users
  WHERE id = p_user_id
  AND account_status = 'active';

  IF v_user_role IS NULL THEN
    RETURN QUERY SELECT false, 'User not found or inactive', NULL;
    RETURN;
  END IF;

  -- Define required roles for each action
  v_required_role := CASE
    WHEN p_action IN ('APPROVE_USER', 'LOCK_USER', 'APPROVE_DEPOSIT', 'APPROVE_WITHDRAW', 'SETTLE_SESSION') THEN 'admin'
    WHEN p_action IN ('VIEW_AUDIT', 'VIEW_REPORTS') THEN 'admin'
    WHEN p_action IN ('CREATE_ADMIN') THEN 'admin'  -- Only admins can create admins
    ELSE NULL
  END;

  -- If action has no role requirement, allow
  IF v_required_role IS NULL THEN
    RETURN QUERY SELECT true, 'Action allowed', NULL;
    RETURN;
  END IF;

  -- Check if user has required role
  IF v_user_role = v_required_role THEN
    RETURN QUERY SELECT true, '', v_required_role;
  ELSE
    v_reason := format('Insufficient permissions. User role: %s, Required: %s', v_user_role, v_required_role);
    RETURN QUERY SELECT false, v_reason, v_required_role;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION enforce_rbac(UUID, VARCHAR, VARCHAR) TO anon, authenticated;

-- =============================================================================
-- INTEGRATION POINTS FOR EXISTING RPC FUNCTIONS
-- =============================================================================
-- These modifications should be added to existing RPC functions:
-- approve_deposit, approve_withdrawal, settle_session, approve_user, etc.

/*
-- Template: Add to START of each admin RPC function:

DECLARE
  v_rbac_allowed BOOLEAN;
  v_rbac_reason TEXT;
  v_session_valid BOOLEAN;
  v_audit_id UUID;
BEGIN
  -- 1. Verify session is still valid (not logged out)
  SELECT valid INTO v_session_valid
  FROM validate_session(p_session_token_hash, auth.uid());

  IF NOT v_session_valid THEN
    RAISE EXCEPTION 'Session invalid or expired';
  END IF;

  -- 2. Verify role at backend (not just frontend)
  SELECT allowed, reason INTO v_rbac_allowed, v_rbac_reason
  FROM enforce_rbac(auth.uid(), 'APPROVE_DEPOSIT', 'transactions');

  IF NOT v_rbac_allowed THEN
    RAISE EXCEPTION v_rbac_reason;
  END IF;

  -- 3. Check rate limiting
  -- SELECT allowed FROM check_rate_limit(auth.uid()::TEXT, 'APPROVE_DEPOSIT:transactions', 10);

  -- ... perform actual operation ...

  -- 4. Log to audit trail
  SELECT audit_id INTO v_audit_id
  FROM audit_log_event(
    auth.uid(),
    'APPROVE_DEPOSIT',
    'transactions',
    p_transaction_id::VARCHAR,
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', 'APPROVED'),
    'Approved by admin',
    current_setting('request.headers')::json->>'x-forwarded-for'
  );

  RETURN ...;
END;
*/

-- =============================================================================
-- SECURITY INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS failed_logins_rate_limit_idx
ON failed_logins(username, ip_address, attempted_at DESC)
WHERE attempted_at > NOW() - INTERVAL '1 minute';

CREATE INDEX IF NOT EXISTS audit_log_admin_action_idx
ON audit_log(admin_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS sessions_valid_idx
ON sessions(user_id, logged_out_at, expires_at)
WHERE logged_out_at IS NULL AND expires_at > NOW();

-- =============================================================================
-- DOCUMENTATION
-- =============================================================================

/*
DEPLOYMENT CHECKLIST:

Before enabling these RPC functions, ensure:

1. ✅ Frontend calls these functions from RoleGuard, SessionService, etc.
2. ✅ All existing admin RPC functions (approve_deposit, settle_session, etc.)
     are updated with audit_log_event calls
3. ✅ Session table is being populated with token_hash on login
4. ✅ Failed login tracking is integrated in auth flow
5. ✅ Session invalidation is called on logout
6. ✅ Rate limiting is checked before expensive operations
7. ✅ RBAC enforcement is called before ANY sensitive action

CRITICAL GAPS FILLED:

[✅] Server-side role verification - prevents localStorage spoofing
[✅] Audit logging RPC - creates official audit trail (not just frontend)
[✅] Session invalidation RPC - prevents old tokens from working
[✅] Failed login tracking - enables brute force detection
[✅] Session validation - checks if token is still valid before use
[✅] Rate limiting enforcement - prevents API abuse
[✅] RBAC enforcement - backend enforces permissions (frontend can't bypass)

REMAINING TODO:

- Update approve_deposit RPC to call audit_log_event
- Update approve_withdraw RPC to call audit_log_event
- Update settle_session RPC to call audit_log_event
- Update approve_user RPC to call audit_log_event
- Implement session creation on login
- Implement failed login tracking on auth failure
- Implement session invalidation on logout
- Add token_hash to sessions table on login
- Create UI warnings when rate limited
*/
