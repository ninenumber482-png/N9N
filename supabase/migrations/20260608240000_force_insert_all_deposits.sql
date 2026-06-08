-- EMERGENCY FIX: Manually insert ALL missing deposit_locks
-- The approve_deposit function was not creating locks - do it directly

INSERT INTO deposit_locks (user_id, deposit_id, amount, turnover_required, turnover_applied, created_at)
SELECT
  t.user_id,
  t.id,
  t.amount::DECIMAL(12,2),
  t.amount::DECIMAL(12,2),  -- 1:1 turnover requirement
  0::DECIMAL(12,2),
  t.created_at
FROM transactions t
WHERE t.type = 'DEPOSIT'
  AND t.status = 'COMPLETED'
  AND NOT EXISTS (SELECT 1 FROM deposit_locks WHERE deposit_id = t.id)
ON CONFLICT (deposit_id) DO NOTHING;

-- Now calculate actual turnover applied based on bets
UPDATE deposit_locks dl
SET turnover_applied = (
  SELECT COALESCE(SUM(b.stake), 0)::DECIMAL(12,2)
  FROM bets b
  WHERE b.user_id = dl.user_id
    AND b.created_at >= dl.created_at
    AND b.status IN ('PENDING', 'SETTLED')
)
WHERE turnover_applied = 0;
