-- APPROVED → set kyc_status = 'APPROVED'
-- REJECTED → set kyc_status = 'REJECTED'

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
      kyc_status = 'APPROVED',
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
      login_status = 'LOCKED',
      kyc_status = 'REJECTED'
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

UPDATE users
SET kyc_status = 'APPROVED'
WHERE registration_status = 'APPROVED'
  AND (kyc_status IS NULL OR kyc_status NOT IN ('APPROVED', 'REJECTED'));

UPDATE users
SET kyc_status = 'REJECTED'
WHERE registration_status = 'REJECTED'
  AND (kyc_status IS NULL OR kyc_status NOT IN ('APPROVED', 'REJECTED'));
