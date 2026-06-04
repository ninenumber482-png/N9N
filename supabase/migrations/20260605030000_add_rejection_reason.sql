-- NUMBER9 — Add rejection_reason column to users table
--
-- The reject_user RPC (20260602220000_fix_all_bypasses.sql:305) sets
-- rejection_reason = p_reason but the column was never added via migration.
-- This caused reject_user to fail with "column users.rejection_reason does not exist".

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMIT;
