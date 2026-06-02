-- Backfill wallets for any users still missing them
INSERT INTO wallet (user_id, balance_main, balance_bonus, total_deposited, total_withdrawn, total_turnover)
SELECT u.id, 0, 0, 0, 0, 0
FROM users u
LEFT JOIN wallet w ON w.user_id = u.id
WHERE w.id IS NULL;
