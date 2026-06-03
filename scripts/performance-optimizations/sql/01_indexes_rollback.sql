-- ============================================================================
-- ROLLBACK: Drop performance indexes (jika ada masalah)
-- ============================================================================
-- Jalankan ini jika indexes menyebabkan masalah (sangat jarang).
-- CONCURRENTLY tidak perlu karena DROP INDEX cepat.
-- ============================================================================

DROP INDEX IF EXISTS idx_users_session_token_expires;
DROP INDEX IF EXISTS idx_failed_logins_brute_force;
DROP INDEX IF EXISTS idx_transactions_user_type_status_created;
DROP INDEX IF EXISTS idx_transactions_type_status_pending;
DROP INDEX IF EXISTS idx_transactions_type_status_created_at;
DROP INDEX IF EXISTS idx_bets_user_status_settled;
DROP INDEX IF EXISTS idx_deposit_locks_user_applied_created;
DROP INDEX IF EXISTS idx_metrics_name_recorded;
DROP INDEX IF EXISTS idx_users_referred_by;
DROP INDEX IF EXISTS idx_king_planned_session;
DROP INDEX IF EXISTS idx_king_results_session;
DROP INDEX IF EXISTS idx_audit_log_table_action_created;
