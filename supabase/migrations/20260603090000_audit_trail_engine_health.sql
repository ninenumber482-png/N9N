-- NUMBER9 — Audit Trail Completeness + Engine Health Monitoring
--
-- 1. Audit trail: setiap transaksi finansial harus tercatat di audit_log
--    LOGIN, LOGOUT, DEPOSIT_SUBMIT, DEPOSIT_APPROVE, DEPOSIT_REJECT,
--    BET_PLACED, SESSION_SETTLED, WITHDRAW_SUBMIT, WITHDRAW_APPROVE, WITHDRAW_REJECT
--
-- 2. Engine health: view + metric tracking untuk monitoring

BEGIN;

-- =============================================================================
-- 1. AUDIT TRAIL — Helper function
-- =============================================================================
CREATE OR REPLACE FUNCTION write_audit(
  p_user_id    UUID,
  p_action     TEXT,
  p_resource   TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_detail     TEXT DEFAULT NULL,
  p_ip         TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, new_value, ip_address)
  VALUES (p_user_id, p_action, p_resource, p_resource_id, p_detail, p_ip);
END;
$$;

REVOKE EXECUTE ON FUNCTION write_audit(UUID, TEXT, TEXT, UUID, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION write_audit(UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO service_role;

-- =============================================================================
-- 2. AUDIT TRAIL — Triggers on transactions table
-- =============================================================================

-- DEPOSIT_SUBMIT: ketika user submit deposit (INSERT transactions)
CREATE OR REPLACE FUNCTION trg_audit_deposit_submit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.type = 'DEPOSIT' THEN
    INSERT INTO audit_log (admin_id, action, resource_type, resource_id, new_value)
    VALUES (NEW.user_id, 'DEPOSIT_SUBMIT', 'transactions', NEW.id,
            jsonb_build_object('amount', NEW.amount, 'method', NEW.method)::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_deposit_submit ON transactions;
CREATE TRIGGER trg_audit_deposit_submit
  AFTER INSERT ON transactions
  FOR EACH ROW
  WHEN (NEW.type = 'DEPOSIT')
  EXECUTE FUNCTION trg_audit_deposit_submit();

-- WITHDRAW_SUBMIT: ketika user submit withdrawal
CREATE OR REPLACE FUNCTION trg_audit_withdraw_submit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.type = 'WITHDRAWAL' THEN
    INSERT INTO audit_log (admin_id, action, resource_type, resource_id, new_value)
    VALUES (NEW.user_id, 'WITHDRAW_SUBMIT', 'transactions', NEW.id,
            jsonb_build_object('amount', NEW.amount, 'method', NEW.method)::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_withdraw_submit ON transactions;
CREATE TRIGGER trg_audit_withdraw_submit
  AFTER INSERT ON transactions
  FOR EACH ROW
  WHEN (NEW.type = 'WITHDRAWAL')
  EXECUTE FUNCTION trg_audit_withdraw_submit();

-- DEPOSIT_APPROVE / DEPOSIT_REJECT / WITHDRAW_APPROVE / WITHDRAW_REJECT: ketika status berubah
CREATE OR REPLACE FUNCTION trg_audit_tx_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF OLD.status = 'PENDING' AND NEW.status = 'COMPLETED' THEN
    v_action := CASE WHEN NEW.type = 'DEPOSIT' THEN 'DEPOSIT_APPROVE' ELSE 'WITHDRAW_APPROVE' END;
    INSERT INTO audit_log (admin_id, action, resource_type, resource_id, old_value, new_value)
    VALUES (NEW.processed_by, v_action, 'transactions', NEW.id,
            jsonb_build_object('status', OLD.status, 'amount', OLD.amount)::text,
            jsonb_build_object('status', NEW.status, 'processed_by', NEW.processed_by)::text);
  ELSIF OLD.status = 'PENDING' AND NEW.status IN ('REJECTED', 'FAILED') THEN
    v_action := CASE WHEN NEW.type = 'DEPOSIT' THEN 'DEPOSIT_REJECT' ELSE 'WITHDRAW_REJECT' END;
    INSERT INTO audit_log (admin_id, action, resource_type, resource_id, old_value, new_value)
    VALUES (NEW.processed_by, v_action, 'transactions', NEW.id,
            jsonb_build_object('status', OLD.status, 'amount', OLD.amount)::text,
            jsonb_build_object('status', NEW.status, 'notes', NEW.notes)::text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tx_status ON transactions;
CREATE TRIGGER trg_audit_tx_status
  AFTER UPDATE OF status ON transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trg_audit_tx_status();

-- =============================================================================
-- 3. AUDIT TRAIL — BET_PLACED trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_audit_bet_placed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, new_value)
  VALUES (NEW.user_id, 'BET_PLACED', 'bets', NEW.id,
          jsonb_build_object('session', NEW.session_code, 'selection', NEW.selection,
                             'stake', NEW.stake, 'payout', NEW.potential_payout)::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_bet_placed ON bets;
CREATE TRIGGER trg_audit_bet_placed
  AFTER INSERT ON bets
  FOR EACH ROW
  EXECUTE FUNCTION trg_audit_bet_placed();

-- =============================================================================
-- 4. AUDIT TRAIL — SESSION_SETTLED trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_audit_session_settled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, new_value)
  VALUES (NULL, 'SESSION_SETTLED', 'king_results', NULL,
          jsonb_build_object('session', NEW.session_code, 'd1', NEW.d1, 'd2', NEW.d2,
                             'd3', NEW.d3, 'total', NEW.total,
                             'big_small', NEW.big_small, 'odd_even', NEW.odd_even)::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_session_settled ON king_results;
CREATE TRIGGER trg_audit_session_settled
  AFTER INSERT ON king_results
  FOR EACH ROW
  EXECUTE FUNCTION trg_audit_session_settled();

-- =============================================================================
-- 5. ENGINE HEALTH — engine_status view
-- =============================================================================
CREATE OR REPLACE VIEW engine_status AS
WITH latest AS (
  SELECT MAX(created_at) as last_result FROM king_results
), metrics_latest AS (
  SELECT metric_name, metric_value, recorded_at
  FROM metrics
  WHERE (metric_name, recorded_at) IN (
    SELECT metric_name, MAX(recorded_at)
    FROM metrics
    WHERE metric_name IN ('king_engine_result_age_sec', 'king_engine_tick_count')
    GROUP BY metric_name
  )
)
SELECT
  (SELECT last_result FROM latest) as last_settlement,
  (SELECT MAX(updated_at) FROM king_planned) as last_plan_generated,
  (SELECT recorded_at FROM metrics_latest WHERE metric_name = 'king_engine_result_age_sec') as last_watchdog,
  (SELECT metric_value FROM metrics_latest WHERE metric_name = 'king_engine_result_age_sec') as result_age_sec,
  CASE
    WHEN (SELECT last_result FROM latest) IS NULL THEN 'NO_RESULTS'
    WHEN (SELECT EXTRACT(EPOCH FROM (NOW() - (SELECT last_result FROM latest)))) > 420 THEN 'STALLED'
    ELSE 'RUNNING'
  END as engine_status;

-- =============================================================================
-- 6. ENGINE HEALTH — tick counter in king_engine_tick
-- =============================================================================
CREATE OR REPLACE FUNCTION king_engine_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now  timestamptz := now();
  v_last timestamptz := to_timestamp(floor(extract(epoch FROM v_now) / 300) * 300);
  v_b    timestamptz;
  v_code text;
  v_pd1 int; v_pd2 int; v_pd3 int;
  v_has_plan boolean;
  i int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('king_engine_tick')::bigint) THEN
    RETURN;
  END IF;

  FOR i IN 1..12 LOOP
    v_b   := v_last + (i * interval '5 min');
    v_code := to_char(v_b AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM king_planned WHERE session_code = v_code)
       AND NOT EXISTS (SELECT 1 FROM king_results WHERE session_code = v_code) THEN
      INSERT INTO king_planned (session_code, d1, d2, d3)
      VALUES (v_code, king_rand_digit(), king_rand_digit(), king_rand_digit())
      ON CONFLICT (session_code) DO NOTHING;
    END IF;
  END LOOP;

  FOR i IN 0..1 LOOP
    v_b   := v_last - (i * interval '5 min');
    v_code := to_char(v_b AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
    IF NOT EXISTS (SELECT 1 FROM king_results WHERE session_code = v_code) THEN
      SELECT d1, d2, d3, true INTO v_pd1, v_pd2, v_pd3, v_has_plan
        FROM king_planned WHERE session_code = v_code;
      IF v_has_plan IS TRUE THEN
        PERFORM settle_session(v_code, v_pd1, v_pd2, v_pd3);
      ELSE
        PERFORM settle_session(v_code, king_rand_digit(), king_rand_digit(), king_rand_digit());
      END IF;
    END IF;
  END LOOP;

  -- Health metric: record tick timestamp
  INSERT INTO metrics (metric_name, metric_value, tags)
  VALUES ('king_engine_tick_count', COALESCE(
    (SELECT metric_value + 1 FROM metrics WHERE metric_name = 'king_engine_tick_count' ORDER BY recorded_at DESC LIMIT 1), 1
  ), jsonb_build_object('ticked_at', v_now));
END;
$$;

REVOKE EXECUTE ON FUNCTION king_engine_tick() FROM anon, authenticated, public;

-- =============================================================================
-- 7. ENGINE HEALTH — LOGIN audit from user-login
--    (user-login EF will call this RPC after successful login)
-- =============================================================================
CREATE OR REPLACE FUNCTION record_login(
  p_user_id UUID,
  p_ip      TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO audit_log (admin_id, action, resource_type, resource_id, ip_address)
  VALUES (p_user_id, 'LOGIN', 'session', NULL, p_ip);
END;
$$;

REVOKE EXECUTE ON FUNCTION record_login(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION record_login(UUID, TEXT) TO authenticated, service_role;

COMMIT;
