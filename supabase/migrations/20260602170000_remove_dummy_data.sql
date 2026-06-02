-- Remove dummy/test data that was injected via API bypass (not through app flow)
-- This ensures all data in the system comes from real user activity

BEGIN;

-- ── Remove dummy sessions for aji (injected by 20260602000000_demo_seed_data.sql) ──
DELETE FROM sessions
WHERE user_id = 'a0000000-0000-0000-0000-000000000002'
  AND (ip_address IN ('192.168.1.10', '10.0.0.5') OR browser_info = 'Safari / iPhone iOS 17' OR browser_info = 'Chrome 124 / Windows 10');

-- ── Remove dummy/injected transactions ──

-- Aji: 500k DEP (past date 2026-05-29, notes "Test catatan dari admin")
DELETE FROM transactions WHERE id = 'a4b9cb39-446c-4271-aa4f-856daa44cdb3';
DELETE FROM transactions WHERE id = 'c01aae63-0671-4ef0-845e-6d7eb8bc9fbf';

-- Hemo test deposits (methods "Test"/"TEST", amounts 1/100, idempotency "test-")
DELETE FROM transactions WHERE id = '1c6b7f01-6a18-43f1-abc3-aec502107197';  -- 50k "Test"
DELETE FROM transactions WHERE id = '47d48b15-9a00-4680-85b1-650a03d031f2';  -- 10k "TEST" idempotency test-
DELETE FROM transactions WHERE id = '0f9c48c4-98a0-4815-af5e-2c295efa812b';  -- 100 "test"
DELETE FROM transactions WHERE id = 'a6f9df8b-7e9b-49fe-b650-64fefb371fb2';  -- 1 "Transfer Bank"
DELETE FROM transactions WHERE id = 'fdd714b8-67e0-479a-b64e-d9cfb593f6f0';  -- 150k no proof

-- Prevent future dummy data injection via trigger
CREATE OR REPLACE FUNCTION trg_prevent_dummy_transactions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.method IS NOT NULL AND LOWER(NEW.method) IN ('test', 'dummy', 'fake') THEN
    RAISE EXCEPTION 'Cannot insert transaction with test/dummy method';
  END IF;
  IF NEW.amount IS NOT NULL AND NEW.amount < 1000 AND NEW.type = 'DEPOSIT' THEN
    RAISE EXCEPTION 'Minimum deposit amount is 1000';
  END IF;
  IF NEW.idempotency_key IS NOT NULL AND NEW.idempotency_key LIKE 'test-%' THEN
    RAISE EXCEPTION 'Cannot insert transaction with test idempotency key';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_dummy_transactions ON transactions;
CREATE TRIGGER trigger_prevent_dummy_transactions
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION trg_prevent_dummy_transactions();

COMMIT;
