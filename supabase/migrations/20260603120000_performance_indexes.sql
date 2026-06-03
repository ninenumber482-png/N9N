-- ============================================================================
-- NUMBER9 Performance Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_session_token_expires
  ON users(session_token, session_expires_at)
  WHERE session_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_failed_logins_brute_force
  ON failed_logins(username, ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_type_status_created
  ON transactions(user_id, type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_type_status_pending
  ON transactions(type, status)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_transactions_type_status_created_at
  ON transactions(type, status, created_at DESC)
  WHERE status = 'COMPLETED';

CREATE INDEX IF NOT EXISTS idx_bets_user_status_settled
  ON bets(user_id, status)
  WHERE status = 'SETTLED';

CREATE INDEX IF NOT EXISTS idx_deposit_locks_user_applied_created
  ON deposit_locks(user_id, turnover_applied, created_at ASC)
  WHERE turnover_applied < turnover_required;

CREATE INDEX IF NOT EXISTS idx_metrics_name_recorded
  ON metrics(metric_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_referred_by
  ON users(referred_by)
  WHERE referred_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_king_planned_session
  ON king_planned(session_code);

CREATE INDEX IF NOT EXISTS idx_king_results_session
  ON king_results(session_code);

ANALYZE users;
ANALYZE transactions;
ANALYZE bets;
ANALYZE deposit_locks;
ANALYZE metrics;
ANALYZE failed_logins;
