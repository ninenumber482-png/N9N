# Quarantined Phase 3 migrations (DO NOT apply as-is)

These were written earlier but never validated against the live DB. Introspection found:
- settle_session rewrite inserts king_results.settled_by/settled_at (columns do NOT exist live) + changes signature (breaks pg_cron/EC2/frontend callers)
- enforce_rbac used wrong action strings (APPROVE_WITHDRAW vs APPROVE_WITHDRAWAL, no REJECT_*) → RBAC silently no-op
- audit_log_event inserts audit_log.reason (column missing live)
- request.headers read without missing_ok → errors under pg_cron/SQL editor
- create_admin inserts into users ignoring NOT NULL columns

Corrected, caller-safe subset lives in: supabase/migrations/20260607_phase3_safe_rbac.sql
