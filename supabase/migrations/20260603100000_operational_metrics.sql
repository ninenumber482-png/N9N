-- NUMBER9 — Operational Metrics (P2 Observability)

BEGIN;

-- =============================================================================
-- 1. RPC error tracking function
-- =============================================================================
CREATE OR REPLACE FUNCTION track_rpc_error(p_rpc TEXT, p_sqlstate TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Track both individual errors and cumulative running count
  INSERT INTO metrics (metric_name, metric_value, tags, recorded_at)
  VALUES (
    CASE WHEN p_sqlstate = '40P01' THEN 'deadlock_count' ELSE 'failed_rpc_count' END,
    1,
    jsonb_build_object('rpc', p_rpc, 'sqlstate', p_sqlstate),
    NOW()
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION track_rpc_error(TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION track_rpc_error(TEXT, TEXT) TO service_role;

-- =============================================================================
-- 2. Snapshot pending counts (every 5 min)
-- =============================================================================
CREATE OR REPLACE FUNCTION snapshot_pending_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO metrics (metric_name, metric_value, tags, recorded_at)
  VALUES ('pending_deposit_count',
    (SELECT COUNT(*) FROM transactions WHERE type = 'DEPOSIT' AND status = 'PENDING'),
    '{"source":"snapshot"}'::jsonb, NOW());

  INSERT INTO metrics (metric_name, metric_value, tags, recorded_at)
  VALUES ('pending_withdraw_count',
    (SELECT COUNT(*) FROM transactions WHERE type = 'WITHDRAWAL' AND status = 'PENDING'),
    '{"source":"snapshot"}'::jsonb, NOW());
END;
$$;
REVOKE EXECUTE ON FUNCTION snapshot_pending_counts() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION snapshot_pending_counts() TO service_role;

SELECT cron.schedule('snapshot-pending-counts', '*/5 * * * *', 'SELECT snapshot_pending_counts();');

-- =============================================================================
-- 3. Ops metrics view (latest value per metric + cumulative errors)
-- =============================================================================
CREATE OR REPLACE VIEW ops_metrics AS
WITH latest AS (
  SELECT DISTINCT ON (metric_name)
    metric_name, metric_value, tags, recorded_at
  FROM metrics
  WHERE metric_name IN (
    'failed_rpc_count', 'deadlock_count', 'settlement_duration_ms',
    'pending_deposit_count', 'pending_withdraw_count',
    'king_engine_result_age_sec', 'king_engine_tick_count'
  )
  ORDER BY metric_name, recorded_at DESC
)
SELECT metric_name, metric_value as value, tags->>'rpc' as rpc, recorded_at
FROM latest
ORDER BY metric_name;

COMMIT;
