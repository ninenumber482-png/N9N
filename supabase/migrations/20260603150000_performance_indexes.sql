-- ============================================================================
-- NUMBER9 Performance Indexes — Non-Blocking (CREATE INDEX CONCURRENTLY)
-- ============================================================================
-- Semua index dibuat dengan CONCURRENTLY untuk menghindari lock table.
-- Dijalankan saat low-traffic atau via pg_cron off-peak.
-- TIDAK mengubah schema, data, atau API signature.
-- ============================================================================

-- 1. RLS Policy: users(session_token, session_expires_at)
--    Mengurangi sequential scan pada setiap query wallet/transactions/bets
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_session_token_expires
  ON users(session_token, session_expires_at)
  WHERE session_token IS NOT NULL;

-- 2. Failed login brute-force protection
--    Mengurangi sequential scan pada setiap login attempt
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_failed_logins_brute_force
  ON failed_logins(username, ip_address, created_at DESC);

-- 3. Transactions: common admin/user queries
--    (user_id, type, status, created_at) untuk deposit/withdrawal history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_user_type_status_created
  ON transactions(user_id, type, status, created_at DESC);

-- 4. Transactions: pending counts untuk dashboard/metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_type_status_pending
  ON transactions(type, status)
  WHERE status = 'PENDING';

-- 5. Transactions: daily reconciliation range queries
--    Menggantikan DATE(created_at) yang tidak bisa pakai index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_type_status_created_at
  ON transactions(type, status, created_at DESC)
  WHERE status = 'COMPLETED';

-- 6. Bets: user settled bets untuk wallet stats
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bets_user_status_settled
  ON bets(user_id, status)
  WHERE status = 'SETTLED';

-- 7. Deposit locks: FIFO turnover application
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deposit_locks_user_applied_created
  ON deposit_locks(user_id, turnover_applied, created_at ASC)
  WHERE turnover_applied < turnover_required;

-- 8. Metrics: tick counter lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_metrics_name_recorded
  ON metrics(metric_name, recorded_at DESC);

-- 9. Referrals: referred_by lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_referred_by
  ON users(referred_by)
  WHERE referred_by IS NOT NULL;

-- 10. King planned/results: batch existence check
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_king_planned_session
  ON king_planned(session_code);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_king_results_session
  ON king_results(session_code);

-- 11. Audit log: partitioned query support (jika belum dipartisi)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_table_action_created
  ON audit_log(table_name, action, created_at DESC);

-- ============================================================================
-- ANALYZE setelah index dibuat untuk update statistics planner
-- ============================================================================
ANALYZE users;
ANALYZE transactions;
ANALYZE bets;
ANALYZE deposit_locks;
ANALYZE metrics;
ANALYZE failed_logins;
ANALYZE audit_log;
