-- =============================================================================
-- Phase 3 — STEP 2/2: enforce_rbac gate on the 6 admin functions.
-- Date: 2026-06-08
--
-- Depends on 20260607 (enforce_rbac, _client_ip, audit_log_event).
--
-- IMPORTANT: each function body below is the EXACT current live body (extracted
-- from the latest migration that defines it: deposit_turnover_locks,
-- restore_withdrawal_atomic_deduction, fix_all_bypasses), with ONLY an
-- enforce_rbac gate prepended. Nothing in the money path is otherwise changed —
-- deposit_locks, FOR UPDATE, atomic deduction, withdrawal refund-on-reject, and
-- the JSONB return are all preserved. (An earlier draft rewrote these from a
-- stale VOID version and would have regressed turnover locks + double-deducted /
-- failed to refund — caught by the live return-type mismatch.)
--
-- Denied calls are logged best-effort (cannot mask the FORBIDDEN result). The
-- success path is left byte-identical to live (no new audit INSERT on the money
-- path). settle_session is NOT touched.
-- =============================================================================

-- audit_log_event: correct the step-1 version to match live audit_log column
-- types (resource_id UUID, old/new_value TEXT). Signature changed → DROP first.
DROP FUNCTION IF EXISTS audit_log_event(UUID,VARCHAR,VARCHAR,VARCHAR,JSONB,JSONB,TEXT,VARCHAR,BOOLEAN);
CREATE OR REPLACE FUNCTION audit_log_event(
  p_admin_id      UUID,
  p_action        VARCHAR,
  p_resource_type VARCHAR,
  p_resource_id   UUID    DEFAULT NULL,
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
          p_old_value::text, p_new_value::text, p_reason, p_ip_address, p_success, NOW())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION audit_log_event(UUID,VARCHAR,VARCHAR,UUID,JSONB,JSONB,TEXT,VARCHAR,BOOLEAN)
  TO anon, authenticated, service_role;

-- Best-effort deny logger: an audit failure (e.g. FK miss for an unknown caller)
-- must never mask the FORBIDDEN result.
CREATE OR REPLACE FUNCTION _audit_deny(p_admin_id UUID, p_action VARCHAR, p_resource_type VARCHAR,
                                       p_resource_id UUID, p_why TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  PERFORM audit_log_event(p_admin_id,p_action,p_resource_type,p_resource_id,
                          NULL,NULL,'DENIED: '||p_why,_client_ip(),false);
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION _audit_deny(UUID,VARCHAR,VARCHAR,UUID,TEXT) TO anon, authenticated, service_role;

-- ── approve_deposit (live body + gate) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_deposit(p_tx_id UUID, p_admin_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_user_id UUID;
  v_amount DECIMAL(12,2);
  v_created_at TIMESTAMP;
  v_ok BOOLEAN; v_why TEXT;
BEGIN
  SELECT allowed, reason INTO v_ok, v_why FROM enforce_rbac(p_admin_id,'APPROVE_DEPOSIT','transactions');
  IF NOT v_ok THEN PERFORM _audit_deny(p_admin_id,'APPROVE_DEPOSIT','transactions',p_tx_id,v_why);
    RAISE EXCEPTION 'FORBIDDEN: %', v_why; END IF;

  SELECT user_id, amount, created_at INTO v_user_id, v_amount, v_created_at
    FROM transactions WHERE id = p_tx_id AND type = 'DEPOSIT' AND status = 'PENDING' FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;

  UPDATE transactions SET status = 'COMPLETED', processed_at = NOW(), processed_by = p_admin_id WHERE id = p_tx_id;

  UPDATE wallet
     SET balance_main = balance_main + v_amount,
         total_deposited = COALESCE(total_deposited, 0) + v_amount,
         updated_at = NOW()
   WHERE user_id = v_user_id;

  INSERT INTO deposit_locks (user_id, deposit_id, amount, turnover_required, turnover_applied, created_at)
  VALUES (v_user_id, p_tx_id, v_amount, v_amount, 0, v_created_at);

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION approve_deposit(UUID,UUID) TO anon, authenticated, service_role;

-- ── reject_deposit (live body + gate) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_deposit(p_tx_id UUID, p_admin_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_user_id UUID;
  v_ok BOOLEAN; v_why TEXT;
BEGIN
  SELECT allowed, reason INTO v_ok, v_why FROM enforce_rbac(p_admin_id,'REJECT_DEPOSIT','transactions');
  IF NOT v_ok THEN PERFORM _audit_deny(p_admin_id,'REJECT_DEPOSIT','transactions',p_tx_id,v_why);
    RAISE EXCEPTION 'FORBIDDEN: %', v_why; END IF;

  SELECT user_id INTO v_user_id FROM transactions WHERE id = p_tx_id AND type = 'DEPOSIT' AND status = 'PENDING' FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;
  UPDATE transactions SET status = 'REJECTED', processed_at = NOW(), processed_by = p_admin_id, notes = p_reason WHERE id = p_tx_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION reject_deposit(UUID,UUID,TEXT) TO anon, authenticated, service_role;

-- ── approve_withdrawal (live body + gate) ───────────────────────────────────
CREATE OR REPLACE FUNCTION approve_withdrawal(p_tx_id UUID, p_admin_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_user_id UUID;
  v_amount DECIMAL(12,2);
  v_status TEXT;
  v_ok BOOLEAN; v_why TEXT;
BEGIN
  SELECT allowed, reason INTO v_ok, v_why FROM enforce_rbac(p_admin_id,'APPROVE_WITHDRAWAL','transactions');
  IF NOT v_ok THEN PERFORM _audit_deny(p_admin_id,'APPROVE_WITHDRAWAL','transactions',p_tx_id,v_why);
    RAISE EXCEPTION 'FORBIDDEN: %', v_why; END IF;

  SELECT user_id, amount, status INTO v_user_id, v_amount, v_status
    FROM transactions WHERE id = p_tx_id AND type = 'WITHDRAWAL' FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;
  IF v_status <> 'PENDING' THEN RAISE EXCEPTION 'TX_NOT_PENDING'; END IF;

  UPDATE transactions SET status = 'COMPLETED', processed_at = NOW(), processed_by = p_admin_id WHERE id = p_tx_id;
  UPDATE wallet SET total_withdrawn = COALESCE(total_withdrawn, 0) + v_amount, updated_at = NOW() WHERE user_id = v_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION approve_withdrawal(UUID,UUID) TO anon, authenticated, service_role;

-- ── reject_withdrawal (live body + gate; refunds the deducted balance) ──────
CREATE OR REPLACE FUNCTION reject_withdrawal(p_tx_id UUID, p_admin_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_user_id UUID;
  v_amount DECIMAL(12,2);
  v_status TEXT;
  v_ok BOOLEAN; v_why TEXT;
BEGIN
  SELECT allowed, reason INTO v_ok, v_why FROM enforce_rbac(p_admin_id,'REJECT_WITHDRAWAL','transactions');
  IF NOT v_ok THEN PERFORM _audit_deny(p_admin_id,'REJECT_WITHDRAWAL','transactions',p_tx_id,v_why);
    RAISE EXCEPTION 'FORBIDDEN: %', v_why; END IF;

  SELECT user_id, amount, status INTO v_user_id, v_amount, v_status
    FROM transactions WHERE id = p_tx_id AND type = 'WITHDRAWAL' FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;
  IF v_status <> 'PENDING' THEN RAISE EXCEPTION 'TX_NOT_PENDING'; END IF;

  UPDATE wallet SET balance_main = balance_main + v_amount, updated_at = NOW() WHERE user_id = v_user_id;
  UPDATE transactions SET status = 'REJECTED', processed_at = NOW(), processed_by = p_admin_id, notes = p_reason WHERE id = p_tx_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION reject_withdrawal(UUID,UUID,TEXT) TO anon, authenticated, service_role;

-- ── approve_user (live body + gate) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_user(p_user_id UUID, p_admin_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_ok BOOLEAN; v_why TEXT;
BEGIN
  SELECT allowed, reason INTO v_ok, v_why FROM enforce_rbac(p_admin_id,'APPROVE_USER','users');
  IF NOT v_ok THEN PERFORM _audit_deny(p_admin_id,'APPROVE_USER','users',p_user_id,v_why);
    RAISE EXCEPTION 'FORBIDDEN: %', v_why; END IF;

  IF p_admin_id = p_user_id THEN RAISE EXCEPTION 'CANNOT_SELF_APPROVE'; END IF;
  UPDATE users SET registration_status = 'APPROVED', account_status = 'ACTIVE', login_status = 'ACTIVE',
         approved_at = NOW(), kyc_status = 'APPROVED', updated_at = NOW()
   WHERE id = p_user_id AND registration_status = 'PENDING_VERIFICATION';
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND_OR_NOT_PENDING'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION approve_user(UUID,UUID) TO anon, authenticated, service_role;

-- ── reject_user (live body + gate) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_user(p_user_id UUID, p_admin_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_ok BOOLEAN; v_why TEXT;
BEGIN
  SELECT allowed, reason INTO v_ok, v_why FROM enforce_rbac(p_admin_id,'REJECT_USER','users');
  IF NOT v_ok THEN PERFORM _audit_deny(p_admin_id,'REJECT_USER','users',p_user_id,v_why);
    RAISE EXCEPTION 'FORBIDDEN: %', v_why; END IF;

  IF p_admin_id = p_user_id THEN RAISE EXCEPTION 'CANNOT_SELF_REJECT'; END IF;
  UPDATE users SET registration_status = 'REJECTED', account_status = 'REJECTED', login_status = 'LOCKED',
         kyc_status = 'REJECTED', rejection_reason = p_reason, updated_at = NOW()
   WHERE id = p_user_id AND registration_status = 'PENDING_VERIFICATION';
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND_OR_NOT_PENDING'; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION reject_user(UUID,UUID,TEXT) TO anon, authenticated, service_role;
