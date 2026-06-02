-- Suppress noisy USER_UPDATED entries by only firing the trigger
-- when meaningful columns change (skip session_token, session_expires_at, updated_at).
-- This avoids logging audit entries for every login (which updates session_token).

CREATE OR REPLACE FUNCTION trg_audit_user_changes() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (admin_id, action, resource_type, resource_id, new_value, ip_address)
    VALUES (NEW.id, 'USER_CREATED', 'user', NEW.id,
            jsonb_build_object('username', NEW.username, 'role', NEW.role)::text, NULL);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log if at least one meaningful column actually changed (skip session/noise columns)
    IF OLD.registration_status IS DISTINCT FROM NEW.registration_status
      OR OLD.account_status IS DISTINCT FROM NEW.account_status
      OR OLD.login_status IS DISTINCT FROM NEW.login_status
      OR OLD.kyc_status IS DISTINCT FROM NEW.kyc_status
      OR OLD.role IS DISTINCT FROM NEW.role
      OR OLD.display_name IS DISTINCT FROM NEW.display_name
      OR OLD.email IS DISTINCT FROM NEW.email
      OR OLD.phone IS DISTINCT FROM NEW.phone
      OR OLD.country IS DISTINCT FROM NEW.country
      OR OLD.bank_name IS DISTINCT FROM NEW.bank_name
      OR OLD.bank_account_number IS DISTINCT FROM NEW.bank_account_number
      OR OLD.bank_account_name IS DISTINCT FROM NEW.bank_account_name
      OR OLD.referred_by IS DISTINCT FROM NEW.referred_by
      OR OLD.password_hash IS DISTINCT FROM NEW.password_hash
    THEN
      INSERT INTO audit_log (admin_id, action, resource_type, resource_id, old_value, new_value, ip_address)
      VALUES (NEW.id, 'USER_UPDATED', 'user', NEW.id,
              jsonb_build_object('username', OLD.username, 'role', OLD.role)::text,
              jsonb_build_object('username', NEW.username, 'role', NEW.role)::text, NULL);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (admin_id, action, resource_type, resource_id, old_value, ip_address)
    VALUES (OLD.id, 'USER_DELETED', 'user', OLD.id,
            jsonb_build_object('username', OLD.username, 'role', OLD.role)::text, NULL);
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

