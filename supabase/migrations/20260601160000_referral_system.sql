-- =============================================================================
-- FASE 1: Referral System Foundation
-- =============================================================================

-- Dedicated referrals table for admin-managed referral codes
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'ACTIVE',
  expires_at TIMESTAMP,
  max_uses INT,
  used_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_created_by ON referrals(created_by);

-- Link users to the referral code they used during registration
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES referrals(id);

-- =============================================================================
-- Audit Logging RPC Function
-- =============================================================================

CREATE OR REPLACE FUNCTION log_admin_action(
  p_admin_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_old_value TEXT DEFAULT NULL,
  p_new_value TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, old_value, new_value, ip_address)
  VALUES (p_admin_id, p_action, p_resource_type, p_resource_id, p_old_value, p_new_value, p_ip_address);
END;
$$;

GRANT EXECUTE ON FUNCTION log_admin_action(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- Helper: Get referral stats (used by admin panel)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_referral_stats()
RETURNS TABLE (
  id UUID,
  code VARCHAR,
  status VARCHAR,
  used_count BIGINT,
  total_users BIGINT,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.code,
    r.status,
    r.used_count,
    COUNT(u.id)::BIGINT AS total_users,
    r.created_at
  FROM referrals r
  LEFT JOIN users u ON u.referred_by = r.id
  GROUP BY r.id, r.code, r.status, r.used_count, r.created_at
  ORDER BY r.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_referral_stats() TO anon, authenticated, service_role;

-- =============================================================================
-- Helper: Approve user + log audit in one call
-- =============================================================================

CREATE OR REPLACE FUNCTION approve_user(
  p_user_id UUID,
  p_admin_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  SELECT registration_status INTO v_old_status FROM users WHERE id = p_user_id;

  UPDATE users
  SET registration_status = 'APPROVED',
      account_status = 'ACTIVE',
      login_status = 'ACTIVE',
      approved_at = NOW()
  WHERE id = p_user_id;

  PERFORM log_admin_action(
    p_admin_id,
    'APPROVE_USER',
    'users',
    p_user_id,
    v_old_status,
    'APPROVED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION approve_user(UUID, UUID) TO anon, authenticated, service_role;

-- =============================================================================
-- Helper: Reject user + log audit in one call
-- =============================================================================

CREATE OR REPLACE FUNCTION reject_user(
  p_user_id UUID,
  p_admin_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  SELECT registration_status INTO v_old_status FROM users WHERE id = p_user_id;

  UPDATE users
  SET registration_status = 'REJECTED',
      account_status = 'REJECTED',
      login_status = 'LOCKED'
  WHERE id = p_user_id;

  PERFORM log_admin_action(
    p_admin_id,
    'REJECT_USER',
    'users',
    p_user_id,
    v_old_status,
    'REJECTED:' || COALESCE(p_reason, 'No reason')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reject_user(UUID, UUID, TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- Helper: Generate unique referral code
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_referral_code(
  p_admin_id UUID,
  p_prefix TEXT DEFAULT 'N9'
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := p_prefix || '-' || UPPER(SUBSTRING(MD5(NOW()::TEXT || RANDOM()::TEXT), 1, 6));
    SELECT EXISTS(SELECT 1 FROM referrals WHERE code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  INSERT INTO referrals (code, created_by, status)
  VALUES (v_code, p_admin_id, 'ACTIVE');

  PERFORM log_admin_action(
    p_admin_id,
    'GENERATE_REFERRAL',
    'referrals',
    NULL,
    NULL,
    v_code
  );

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_referral_code(UUID, TEXT) TO anon, authenticated, service_role;
