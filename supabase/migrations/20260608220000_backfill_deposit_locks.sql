-- CRITICAL FIX: Backfill missing deposit_locks
-- The approve_deposit function should create deposit_locks, but they weren't being created
-- This migration creates deposit_lock records for all COMPLETED deposits

BEGIN;

-- Insert deposit_locks for all COMPLETED deposits that don't have locks yet
INSERT INTO deposit_locks (user_id, deposit_id, amount, turnover_required, turnover_applied, created_at)
SELECT
  t.user_id,
  t.id,
  t.amount,
  t.amount::DECIMAL(12,2), -- 1x turnover requirement
  0::DECIMAL(12,2), -- 0 turnover applied initially (we'll calculate from bets)
  t.created_at
FROM transactions t
WHERE t.type = 'DEPOSIT'
  AND t.status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM deposit_locks dl WHERE dl.deposit_id = t.id
  )
ON CONFLICT DO NOTHING;

-- Now update turnover_applied based on bets placed AFTER this deposit
UPDATE deposit_locks dl
SET turnover_applied = (
  SELECT COALESCE(SUM(b.stake), 0)::DECIMAL(12,2)
  FROM bets b
  WHERE b.user_id = dl.user_id
    AND b.status = 'SETTLED'
    AND b.created_at >= dl.created_at
  LIMIT 1 OFFSET (
    SELECT COUNT(*)
    FROM deposit_locks dl2
    WHERE dl2.user_id = dl.user_id
      AND dl2.created_at < dl.created_at
  )
)
WHERE dl.turnover_applied = 0;

COMMIT;
