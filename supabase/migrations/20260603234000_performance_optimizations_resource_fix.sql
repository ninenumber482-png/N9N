-- =============================================================================
-- PERFORMANCE OPTIMIZATION: Reduce resource exhaustion
-- 
-- Problems identified from pg_stat_statements:
-- 1. realtime.list_changes: 34,978 calls, 240s total — excessive realtime activity
-- 2. audit_log INSERT: 12,053 calls — trigger fires too frequently
-- 3. sessions UPDATE: 12,106 calls — last_activity updated too often
-- 4. kyc_documents: 35MB bloat, 0 rows → VACUUM ANALYZE done
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. OPTIMIZE: Reduce audit_log trigger frequency
--    Only audit on meaningful changes, not every column update
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_audit_user_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_old_value TEXT;
  v_new_value TEXT;
  v_changes TEXT := '';
BEGIN
  -- Skip if only updated_at changed (no meaningful change)
  IF TG_OP = 'UPDATE' THEN
    IF NEW.updated_at IS NOT NULL AND OLD.updated_at IS NOT NULL THEN
      -- Check if only timestamp columns changed
      IF NEW.username = OLD.username AND 
         NEW.email IS NOT DISTINCT FROM OLD.email AND
         NEW.role = OLD.role AND
         NEW.account_status = OLD.account_status AND
         NEW.registration_status = OLD.registration_status AND
         NEW.login_status = OLD.login_status AND
         NEW.balance_main IS NOT DISTINCT FROM OLD.balance_main AND
         NEW.kyc_status IS NOT DISTINCT FROM OLD.kyc_status THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- Build change summary
  IF TG_OP = 'UPDATE' THEN
    IF NEW.username != OLD.username THEN
      v_changes := v_changes || format('username: %s → %s; ', OLD.username, NEW.username);
    END IF;
    IF NEW.role != OLD.role THEN
      v_changes := v_changes || format('role: %s → %s; ', OLD.role, NEW.role);
    END IF;
    IF NEW.account_status != OLD.account_status THEN
      v_changes := v_changes || format('account_status: %s → %s; ', OLD.account_status, NEW.account_status);
    END IF;
    IF NEW.registration_status != OLD.registration_status THEN
      v_changes := v_changes || format('registration_status: %s → %s; ', OLD.registration_status, NEW.registration_status);
    END IF;
    IF NEW.login_status != OLD.login_status THEN
      v_changes := v_changes || format('login_status: %s → %s; ', OLD.login_status, NEW.login_status);
    END IF;
    IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
      v_changes := v_changes || format('kyc_status: %s → %s; ', COALESCE(OLD.kyc_status, 'NULL'), COALESCE(NEW.kyc_status, 'NULL'));
    END IF;
    
    -- Skip if no meaningful changes
    IF v_changes = '' THEN
      RETURN NEW;
    END IF;
    
    v_old_value := row_to_json(OLD)::TEXT;
    v_new_value := row_to_json(NEW)::TEXT;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_value := row_to_json(OLD)::TEXT;
    v_new_value := NULL;
  ELSE
    v_old_value := NULL;
    v_new_value := row_to_json(NEW)::TEXT;
  END IF;

  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, old_value, new_value)
  VALUES (
    COALESCE(current_setting('app.current_admin_id', true)::UUID, '00000000-0000-0000-0000-000000000000'::UUID),
    TG_OP,
    'users',
    COALESCE(NEW.id, OLD.id),
    LEFT(v_old_value, 1000),
    LEFT(v_new_value, 1000)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. OPTIMIZE: Reduce sessions last_activity update frequency
--    Only update if last activity was more than 5 minutes ago
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update last_activity if it's been more than 5 minutes
  IF OLD.last_activity IS NULL OR NEW.last_activity > OLD.last_activity + INTERVAL '5 minutes' THEN
    RETURN NEW;
  END IF;
  
  -- Otherwise, keep the old last_activity to avoid excessive updates
  NEW.last_activity := OLD.last_activity;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists and recreate
DROP TRIGGER IF EXISTS trg_throttle_session_activity ON sessions;
CREATE TRIGGER trg_throttle_session_activity
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION trg_update_session_activity();

-- =============================================================================
-- 3. OPTIMIZE: Add composite indexes for common query patterns
-- =============================================================================

-- Index for audit_log queries (common in admin panel)
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- Index for sessions cleanup queries
CREATE INDEX IF NOT EXISTS idx_sessions_expires_loggedout ON sessions(expires_at) WHERE logged_out_at IS NULL;

-- Index for transactions user queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at DESC);

-- Index for bets user queries  
CREATE INDEX IF NOT EXISTS idx_bets_user_status ON bets(user_id, status);

-- =============================================================================
-- 4. OPTIMIZE: Prune old audit logs (keep last 30 days)
-- =============================================================================

-- Create function for scheduled cleanup
CREATE OR REPLACE FUNCTION prune_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- Schedule cleanup if pg_cron is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('prune-audit-logs', '0 3 * * *', 'SELECT public.prune_old_audit_logs();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron might not be available
  NULL;
END $$;

COMMIT;
