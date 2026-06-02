-- NUMBER9 Audit System Database Enhancement
-- Comprehensive audit logging, security tracking, compliance functions
-- Execute in Supabase SQL Editor

-- =============================================================================
-- ENHANCE EXISTING AUDIT TABLE
-- =============================================================================

ALTER TABLE IF EXISTS audit_log ADD COLUMN IF NOT EXISTS (
  session_id VARCHAR(255),
  failed_attempts INT DEFAULT 0,
  device_info JSONB,
  browser_info TEXT,
  user_agent TEXT,
  error_stacktrace TEXT,
  request_body JSONB,
  response_status INT,
  duration_ms INT
);

-- Create comprehensive indexes for audit log queries
CREATE INDEX IF NOT EXISTS audit_log_timestamp_idx ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_admin_timestamp_idx ON audit_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action);
CREATE INDEX IF NOT EXISTS audit_log_ip_idx ON audit_log(ip_address);

-- =============================================================================
-- FAILED LOGINS TABLE (Brute Force Detection)
-- =============================================================================

CREATE TABLE IF NOT EXISTS failed_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50),
  ip_address VARCHAR(50),
  reason VARCHAR(100),
  user_agent TEXT,
  attempted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS failed_logins_username_ip_idx ON failed_logins(username, ip_address);
CREATE INDEX IF NOT EXISTS failed_logins_timestamp_idx ON failed_logins(created_at DESC);
CREATE INDEX IF NOT EXISTS failed_logins_ip_idx ON failed_logins(ip_address);

-- =============================================================================
-- SESSIONS TABLE (Session Management & Security)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255),
  ip_address VARCHAR(50),
  browser_info TEXT,
  device_info JSONB,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  logged_out_at TIMESTAMP,
  logout_reason VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS sessions_created_at_idx ON sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

-- =============================================================================
-- TRANSACTION AUDIT DETAILS TABLE (Enhanced Tracking)
-- =============================================================================

CREATE TABLE IF NOT EXISTS transaction_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  action VARCHAR(50), -- 'REQUESTED', 'APPROVED', 'REJECTED', 'SETTLED'
  admin_id UUID REFERENCES users(id),
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  reason TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transaction_audit_transaction_idx ON transaction_audit(transaction_id);
CREATE INDEX IF NOT EXISTS transaction_audit_admin_idx ON transaction_audit(admin_id);
CREATE INDEX IF NOT EXISTS transaction_audit_created_idx ON transaction_audit(created_at DESC);

-- =============================================================================
-- USER AUDIT DETAILS TABLE (Track User Changes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES users(id),
  action VARCHAR(50), -- 'CREATED', 'APPROVED', 'REJECTED', 'LOCKED', 'SUSPENDED'
  old_values JSONB,
  new_values JSONB,
  reason TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_audit_user_idx ON user_audit(user_id);
CREATE INDEX IF NOT EXISTS user_audit_admin_idx ON user_audit(admin_id);
CREATE INDEX IF NOT EXISTS user_audit_created_idx ON user_audit(created_at DESC);

-- =============================================================================
-- SECURITY ALERTS TABLE (Real-time Security Events)
-- =============================================================================

CREATE TABLE IF NOT EXISTS security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR(50), -- 'brute_force', 'suspicious_login', 'unusual_activity'
  severity VARCHAR(20), -- 'low', 'medium', 'high', 'critical'
  user_id UUID REFERENCES users(id),
  ip_address VARCHAR(50),
  description TEXT,
  details JSONB,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS security_alerts_user_idx ON security_alerts(user_id);
CREATE INDEX IF NOT EXISTS security_alerts_severity_idx ON security_alerts(severity);
CREATE INDEX IF NOT EXISTS security_alerts_type_idx ON security_alerts(alert_type);
CREATE INDEX IF NOT EXISTS security_alerts_resolved_idx ON security_alerts(resolved_at);

-- =============================================================================
-- METRICS TABLE (Analytics & Reporting)
-- =============================================================================

CREATE TABLE IF NOT EXISTS metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(100),
  metric_value NUMERIC,
  tags JSONB,
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS metrics_name_idx ON metrics(metric_name);
CREATE INDEX IF NOT EXISTS metrics_recorded_idx ON metrics(recorded_at DESC);

-- =============================================================================
-- PL/pgSQL FUNCTIONS FOR AUDIT OPERATIONS
-- =============================================================================

-- Function: Record failed login attempt
CREATE OR REPLACE FUNCTION fn_record_failed_login(
  p_username VARCHAR,
  p_ip_address VARCHAR,
  p_reason VARCHAR,
  p_user_agent TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO failed_logins (username, ip_address, reason, user_agent)
  VALUES (p_username, p_ip_address, p_reason, p_user_agent)
  RETURNING id INTO v_id;

  -- Alert if too many failed attempts
  IF (SELECT COUNT(*) FROM failed_logins
      WHERE username = p_username
      AND ip_address = p_ip_address
      AND created_at > NOW() - INTERVAL '15 minutes') > 5
  THEN
    INSERT INTO security_alerts (alert_type, severity, ip_address, description, details)
    VALUES ('brute_force', 'high', p_ip_address,
            'Brute force attempt detected: ' || p_username,
            jsonb_build_object('username', p_username, 'attempts', 6));
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Create session
CREATE OR REPLACE FUNCTION fn_create_session(
  p_user_id UUID,
  p_token_hash VARCHAR,
  p_ip_address VARCHAR,
  p_browser_info TEXT,
  p_device_info JSONB,
  p_user_agent TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO sessions (user_id, token_hash, ip_address, browser_info, device_info, user_agent, expires_at)
  VALUES (p_user_id, p_token_hash, p_ip_address, p_browser_info, p_device_info, p_user_agent,
          NOW() + INTERVAL '30 days')
  RETURNING id INTO v_id;

  -- Log session creation
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, ip_address)
  VALUES (p_user_id, 'SESSION_CREATED', 'session', v_id, p_ip_address);

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function: End session
CREATE OR REPLACE FUNCTION fn_end_session(
  p_session_id UUID,
  p_reason VARCHAR,
  p_ip_address VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  UPDATE sessions
  SET logged_out_at = NOW(), logout_reason = p_reason
  WHERE id = p_session_id
  RETURNING user_id INTO v_user_id;

  -- Log session termination
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, ip_address)
  VALUES (v_user_id, 'SESSION_TERMINATED', 'session', p_session_id, p_ip_address);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: Record transaction approval
CREATE OR REPLACE FUNCTION fn_record_transaction_approval(
  p_transaction_id UUID,
  p_admin_id UUID,
  p_new_status VARCHAR,
  p_reason TEXT,
  p_ip_address VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_old_status VARCHAR;
BEGIN
  -- Get old status
  SELECT status INTO v_old_status FROM transactions WHERE id = p_transaction_id;

  -- Update transaction
  UPDATE transactions
  SET status = p_new_status, processed_by = p_admin_id, processed_at = NOW()
  WHERE id = p_transaction_id;

  -- Log in transaction_audit
  INSERT INTO transaction_audit (transaction_id, action, admin_id, old_status, new_status, reason, ip_address)
  VALUES (p_transaction_id, p_new_status, p_admin_id, v_old_status, p_new_status, p_reason, p_ip_address);

  -- Log in main audit log
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, old_value, new_value, ip_address)
  VALUES (p_admin_id, 'TRANSACTION_' || p_new_status, 'transaction', p_transaction_id,
          jsonb_build_object('status', v_old_status),
          jsonb_build_object('status', p_new_status),
          p_ip_address);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: Record user approval
CREATE OR REPLACE FUNCTION fn_record_user_approval(
  p_user_id UUID,
  p_admin_id UUID,
  p_new_status VARCHAR,
  p_reason TEXT,
  p_ip_address VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_old_status VARCHAR;
BEGIN
  -- Get old status
  SELECT registration_status INTO v_old_status FROM users WHERE id = p_user_id;

  -- Update user
  UPDATE users
  SET registration_status = p_new_status, approved_by = p_admin_id, approved_at = NOW()
  WHERE id = p_user_id;

  -- Log in user_audit
  INSERT INTO user_audit (user_id, admin_id, action, old_values, new_values, reason, ip_address)
  VALUES (p_user_id, p_admin_id, p_new_status,
          jsonb_build_object('registration_status', v_old_status),
          jsonb_build_object('registration_status', p_new_status),
          p_reason, p_ip_address);

  -- Log in main audit log
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, old_value, new_value, ip_address)
  VALUES (p_admin_id, 'USER_' || p_new_status, 'user', p_user_id,
          jsonb_build_object('status', v_old_status),
          jsonb_build_object('status', p_new_status),
          p_ip_address);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: Get audit summary (for dashboard)
CREATE OR REPLACE FUNCTION fn_get_audit_summary(p_days INT DEFAULT 7)
RETURNS TABLE (
  total_logins BIGINT,
  failed_logins BIGINT,
  total_transactions BIGINT,
  approved_transactions BIGINT,
  rejected_transactions BIGINT,
  total_users BIGINT,
  new_users BIGINT,
  security_alerts BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM audit_log WHERE action = 'LOGIN_SUCCESS' AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT,
    (SELECT COUNT(*) FROM failed_logins WHERE created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT,
    (SELECT COUNT(*) FROM audit_log WHERE resource_type = 'transaction' AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT,
    (SELECT COUNT(*) FROM audit_log WHERE action = 'TRANSACTION_APPROVED' AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT,
    (SELECT COUNT(*) FROM audit_log WHERE action = 'TRANSACTION_REJECTED' AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT,
    (SELECT COUNT(*) FROM users)::BIGINT,
    (SELECT COUNT(*) FROM audit_log WHERE action = 'USER_REGISTERED' AND created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT,
    (SELECT COUNT(*) FROM security_alerts WHERE created_at > NOW() - (p_days || ' days')::INTERVAL)::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user audit trail
CREATE OR REPLACE FUNCTION fn_get_user_audit_trail(p_user_id UUID, p_limit INT DEFAULT 100)
RETURNS TABLE (
  action VARCHAR,
  timestamp TIMESTAMP,
  ip_address VARCHAR,
  details JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.action,
    a.created_at,
    a.ip_address,
    jsonb_build_object(
      'resource_type', a.resource_type,
      'resource_id', a.resource_id,
      'old_value', a.old_value,
      'new_value', a.new_value
    ) as details
  FROM audit_log a
  WHERE a.admin_id = p_user_id OR (a.resource_id = p_user_id AND a.resource_type = 'user')
  ORDER BY a.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- SAMPLE DATA & VERIFICATION
-- =============================================================================

-- Check if audit system is working
SELECT 'Audit System Setup Complete' as status;
SELECT COUNT(*) as audit_entries FROM audit_log;
SELECT COUNT(*) as failed_login_entries FROM failed_logins;
SELECT COUNT(*) as active_sessions FROM sessions WHERE logged_out_at IS NULL;
SELECT COUNT(*) as security_alerts FROM security_alerts WHERE resolved_at IS NULL;

-- Sample query: Get last 10 login attempts
-- SELECT * FROM audit_log WHERE action IN ('LOGIN_SUCCESS', 'LOGIN_FAILED') ORDER BY created_at DESC LIMIT 10;

-- Sample query: Get audit summary for last 7 days
-- SELECT * FROM fn_get_audit_summary(7);

-- Sample query: Get a user's audit trail
-- SELECT * FROM fn_get_user_audit_trail('user-uuid-here');
