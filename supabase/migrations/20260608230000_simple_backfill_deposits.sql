-- Simple backfill: create deposit_lock for each COMPLETED deposit
-- This time with simpler logic

INSERT INTO deposit_locks (user_id, deposit_id, amount, turnover_required, turnover_applied, created_at)
SELECT
  t.user_id,
  t.id,
  CAST(t.amount AS DECIMAL(12,2)),
  CAST(t.amount AS DECIMAL(12,2)),  -- Turnover requirement = deposit amount
  0::DECIMAL(12,2),  -- No turnover applied yet (will be calculated from bets)
  t.created_at
FROM transactions t
WHERE t.type = 'DEPOSIT'
  AND t.status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM deposit_locks dl WHERE dl.deposit_id = t.id
  )
ON CONFLICT (deposit_id) DO NOTHING;
