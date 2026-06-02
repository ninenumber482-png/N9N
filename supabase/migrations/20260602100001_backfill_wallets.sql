-- Create wallets for existing users who don't have one
INSERT INTO wallet (user_id, balance_main, balance_bonus, total_deposited, total_withdrawn)
SELECT u.id, 0, 0, 0, 0
FROM users u
LEFT JOIN wallet w ON w.user_id = u.id
WHERE w.id IS NULL;
