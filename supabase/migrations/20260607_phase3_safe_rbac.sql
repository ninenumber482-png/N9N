-- =============================================================================
-- Phase 3 — STEP 1/2: additive primitives (RBAC + audit). ZERO behaviour change.
-- Date: 2026-06-07
--
-- Written after introspecting the live DB (project dqsmpdetiqsqfnidekik) and the
-- real callers. This file ONLY adds new objects + nullable/defaulted columns. It
-- does NOT replace any existing function, so it cannot break current behaviour.
-- The function replacements that actually turn enforcement ON live in step 2
-- (20260608_phase3_enforce.sql), applied only after enforce_rbac is verified.
--
-- Excluded entirely (see supabase/_quarantine_phase3/README.md): settle_session
-- rewrite, create_admin, and the session/failed-login RPCs.
-- =============================================================================

-- 1. audit_log: live table lacks these; audit_log_event writes reason + success.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS reason  TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT true;

-- 2. safe client-IP helper. request.headers GUC is absent under pg_cron / SQL
--    editor; missing_ok=true avoids "unrecognized configuration parameter".
CREATE OR REPLACE FUNCTION _client_ip() RETURNS TEXT
LANGUAGE plpgsql STABLE AS $$
DECLARE h TEXT;
BEGIN
  h := current_setting('request.headers', true);
  IF h IS NULL OR h = '' THEN RETURN NULL; END IF;
  RETURN (h::json ->> 'x-forwarded-for');
EXCEPTION WHEN others THEN RETURN NULL;
END;
$$;

-- 3. enforce_rbac — role check from DB (source of truth). Accepts admin AND
--    superadmin (admin_create_user permits both); the seeded admin "number9" is
--    role='admin'. Action strings match EXACTLY what step 2 passes.
CREATE OR REPLACE FUNCTION enforce_rbac(
  p_user_id       UUID,
  p_action        VARCHAR,
  p_resource_type VARCHAR
) RETURNS TABLE (allowed BOOLEAN, reason TEXT, required_role VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_user_role  VARCHAR;
  v_needs_admin BOOLEAN;
BEGIN
  SELECT role INTO v_user_role FROM users WHERE id = p_user_id;

  IF v_user_role IS NULL THEN
    RETURN QUERY SELECT false, 'User not found', NULL::VARCHAR; RETURN;
  END IF;

  v_needs_admin := p_action IN (
    'APPROVE_DEPOSIT','REJECT_DEPOSIT',
    'APPROVE_WITHDRAWAL','REJECT_WITHDRAWAL',
    'APPROVE_USER','REJECT_USER',
    'LOCK_USER','CREATE_ADMIN','SETTLE_SESSION','VIEW_AUDIT'
  );

  IF NOT v_needs_admin THEN
    RETURN QUERY SELECT true, 'No role requirement', NULL::VARCHAR; RETURN;
  END IF;

  IF v_user_role IN ('admin','superadmin') THEN
    RETURN QUERY SELECT true, ''::TEXT, 'admin'::VARCHAR; RETURN;
  END IF;

  RETURN QUERY SELECT false,
    format('admin required, caller is %s', v_user_role), 'admin'::VARCHAR;
END;
$$;
GRANT EXECUTE ON FUNCTION enforce_rbac(UUID, VARCHAR, VARCHAR) TO anon, authenticated, service_role;

-- 4. audit_log_event — immutable trail; columns aligned to LIVE audit_log.
CREATE OR REPLACE FUNCTION audit_log_event(
  p_admin_id      UUID,
  p_action        VARCHAR,
  p_resource_type VARCHAR,
  p_resource_id   VARCHAR DEFAULT NULL,
  p_old_value     JSONB   DEFAULT NULL,
  p_new_value     JSONB   DEFAULT NULL,
  p_reason        TEXT    DEFAULT NULL,
  p_ip_address    VARCHAR DEFAULT NULL,
  p_success       BOOLEAN DEFAULT true
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id,
                         old_value, new_value, reason, ip_address, success, created_at)
  VALUES (p_admin_id, p_action, p_resource_type, p_resource_id,
          p_old_value, p_new_value, p_reason, p_ip_address, p_success, NOW())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION audit_log_event(UUID,VARCHAR,VARCHAR,VARCHAR,JSONB,JSONB,TEXT,VARCHAR,BOOLEAN)
  TO anon, authenticated, service_role;
