-- NUMBER9 Security Hardening
-- Safe changes: UUID collision fix, admin RPC restriction,
-- platform_accounts/king_planned write restriction, n9_audit_logs.
-- RLS on users table deferred — needs registration moved to Edge Function first.

-- =============================================================================
-- 1. Fix UUID Collision
--    number9 user had same UUID (a0000000-...003) as demo user.
--    Unique UUID: a0000000-0000-0000-0000-000000000006
-- =============================================================================
INSERT INTO users (
  id, username, password_hash, display_name, email, phone, country,
  role, account_status, registration_status, login_status,
  referral_code, created_at, approved_at
)
SELECT
  'a0000000-0000-0000-0000-000000000006',
  'number9',
  '$2b$12$9bfYtPyPPP.EdkFLh7ns8.KkpdZ9DZff0cjegYwN/6Fc.ww5c8wua',
  'Number9',
  'number9@number9.local',
  '',
  'Indonesia',
  'admin',
  'ACTIVE',
  'APPROVED',
  'ACTIVE',
  'N9-NUMBER9-ADMIN',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'number9');

-- =============================================================================
-- 2. Revoke anon/authenticated from admin RPCs
--    Only service_role (via admin-proxy with service_role key) can call these.
--    Stops API-level attacks: any anon user could previously call these.
-- =============================================================================

-- Money-moving RPCs
REVOKE EXECUTE ON FUNCTION approve_deposit(UUID, UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION reject_deposit(UUID, UUID, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION approve_withdrawal(UUID, UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION reject_withdrawal(UUID, UUID, TEXT) FROM anon, authenticated;

-- User management
REVOKE EXECUTE ON FUNCTION approve_user(UUID, UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION reject_user(UUID, UUID, TEXT) FROM anon, authenticated;

-- Referral (admin-only)
REVOKE EXECUTE ON FUNCTION generate_referral_code(UUID, TEXT) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_referral_stats() FROM anon, authenticated;

-- Game settlement (controls draw outcomes)
REVOKE EXECUTE ON FUNCTION settle_session(TEXT, INT, INT, INT) FROM anon, authenticated;

-- Audit logging
REVOKE EXECUTE ON FUNCTION log_admin_action(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) FROM anon, authenticated;

-- =============================================================================
-- 3. Restrict platform_accounts — anon can only SELECT (view payment methods)
--    INSERT, UPDATE, DELETE restricted to service_role / authenticated only.
--    Prevents attackers from modifying bank/ewallet accounts.
-- =============================================================================
REVOKE INSERT, UPDATE, DELETE ON platform_accounts FROM anon;

-- =============================================================================
-- 4. Restrict king_planned — anon can only SELECT (see upcoming draws)
--    INSERT, UPDATE restricted to service_role only.
--    Prevents attackers from rigging draw outcomes.
-- =============================================================================
REVOKE INSERT, UPDATE ON king_planned FROM anon, authenticated;

-- =============================================================================
-- 5. Create missing n9_audit_logs table
--    Referenced by edge functions: auth-login, auth-logout, upload-file.
--    Without this table, those edge functions error at runtime.
-- =============================================================================
CREATE TABLE IF NOT EXISTS n9_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  action      VARCHAR(100) NOT NULL,
  details     TEXT,
  ip_address  VARCHAR(50),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_n9_audit_logs_user_id   ON n9_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_n9_audit_logs_action     ON n9_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_n9_audit_logs_created_at ON n9_audit_logs(created_at DESC);

GRANT SELECT, INSERT ON n9_audit_logs TO anon, authenticated, service_role;

-- =============================================================================
-- 6. Future hardening (requires moving registration to Edge Function)
-- =============================================================================
-- TODO: Enable RLS on users table + restrict sensitive columns
--       (password_hash, session_token, session_expires_at)
-- TODO: Move registration flow to an Edge Function so users table
--       can have fully restrictive RLS policies.
-- TODO: RLS on sessions, audit_log, referrals tables.
-- TODO: Hash admin session tokens (store SHA-256 instead of plaintext).
-- TODO: Add MFA / TOTP support to auth-login.
-- TODO: Replace hardcoded admin credentials with database-backed auth.
-- TODO: Add rate limiting to auth-login (call fn_record_failed_login()).
