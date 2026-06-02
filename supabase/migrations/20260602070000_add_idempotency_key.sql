-- Add idempotency key to transactions to prevent duplicate deposits/withdrawals
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100) UNIQUE;
CREATE INDEX IF NOT EXISTS transactions_idempotency_key_idx ON transactions(idempotency_key);
