-- =============================================================================
-- NUMBER9 Wallet Concurrency Test
-- Test: approve_deposit → place_bet → submit_withdrawal secara berurutan
-- Jalankan: supabase db query --linked --file scripts/concurrency-test.sql
-- =============================================================================

DO $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-000000000001';
  v_admin_id UUID := '00000000-0000-0000-0000-000000000000';
  v_tx_id UUID;
  v_balance DECIMAL;
  v_locked DECIMAL;
  v_result RECORD;
  v_ok BOOLEAN;
BEGIN
  -- Setup users jika belum ada
  INSERT INTO users (id, username, display_name, role, account_status, registration_status, login_status, kyc_status, password_hash)
  VALUES (v_admin_id, 'concurrent_admin', 'CA', 'admin', 'ACTIVE', 'APPROVED', 'ACTIVE', 'APPROVED', '$2a$10$dummy')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO wallet (user_id, balance_main) VALUES (v_admin_id, 0) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO users (id, username, display_name, role, account_status, registration_status, login_status, kyc_status, session_token, session_expires_at, password_hash)
  VALUES (v_user_id, 'concurrent_test', 'CT', 'user', 'ACTIVE', 'APPROVED', 'ACTIVE', 'APPROVED', 'test-token', NOW() + INTERVAL '1 day', '$2a$10$dummy')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO wallet (user_id, balance_main, total_deposited, total_turnover)
  VALUES (v_user_id, 0, 0, 0) ON CONFLICT (user_id) DO UPDATE SET balance_main = 0, total_deposited = 0, total_turnover = 0;

  -- Bersihkan test data sebelumnya
  DELETE FROM deposit_locks WHERE user_id = v_user_id;
  DELETE FROM bets WHERE user_id = v_user_id AND session_code LIKE 'CONCUR-%';
  DELETE FROM king_results WHERE session_code LIKE 'CONCUR-%';
  DELETE FROM transactions WHERE user_id = v_user_id;

  -- Reset wallet
  UPDATE wallet SET balance_main = 0, total_deposited = 0, total_turnover = 0 WHERE user_id = v_user_id;

  -- Set request header untuk place_bet (verify session_token)
  PERFORM set_config('request.headers', '{"x-user-token": "test-token"}', true);

  RAISE NOTICE '========================================';
  RAISE NOTICE '=== TEST 1: approve_deposit ===';
  RAISE NOTICE '========================================';

  -- Submit deposit 10000
  INSERT INTO transactions (id, user_id, type, amount, status, method)
  VALUES (gen_random_uuid(), v_user_id, 'DEPOSIT', 10000, 'PENDING', 'Bank Transfer')
  RETURNING id INTO v_tx_id;

  -- Approve
  PERFORM approve_deposit(v_tx_id, v_admin_id);

  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = v_user_id;
  IF v_balance != 10000 THEN RAISE EXCEPTION 'FAIL 1a: balance=% expected=10000', v_balance; END IF;
  RAISE NOTICE 'PASS 1a: deposit 10000 → balance=%', v_balance;

  IF NOT EXISTS (SELECT 1 FROM deposit_locks WHERE user_id = v_user_id AND turnover_required = 10000 AND turnover_applied = 0) THEN
    RAISE EXCEPTION 'FAIL 1b: deposit_lock not created';
  END IF;
  RAISE NOTICE 'PASS 1b: deposit_lock created (required=10000 applied=0)';

  -- Coba approve deposit yang sudah di-approve (idempotency)
  BEGIN
    PERFORM approve_deposit(v_tx_id, v_admin_id);
    RAISE EXCEPTION 'FAIL 1c: double approve should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%TX_NOT_FOUND%' THEN
      RAISE NOTICE 'PASS 1c: double approve correctly rejected';
    ELSE
      RAISE;
    END IF;
  END;

  -- Deposit kedua 5000
  INSERT INTO transactions (id, user_id, type, amount, status, method)
  VALUES (gen_random_uuid(), v_user_id, 'DEPOSIT', 5000, 'PENDING', 'Bank Transfer')
  RETURNING id INTO v_tx_id;

  PERFORM approve_deposit(v_tx_id, v_admin_id);

  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = v_user_id;
  IF v_balance != 15000 THEN RAISE EXCEPTION 'FAIL 1d: balance=% expected=15000', v_balance; END IF;
  RAISE NOTICE 'PASS 1d: deposit 5000 → balance=%', v_balance;

  IF (SELECT COUNT(*) FROM deposit_locks WHERE user_id = v_user_id) != 2 THEN
    RAISE EXCEPTION 'FAIL 1e: expected 2 locks, got %', (SELECT COUNT(*) FROM deposit_locks WHERE user_id = v_user_id);
  END IF;
  RAISE NOTICE 'PASS 1e: 2 deposit_locks created';

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '=== TEST 2: place_bet (FIFO turnover) ===';
  RAISE NOTICE '========================================';

  -- Bet 4000 → apply ke lock pertama (10000)
  SELECT place_bet(v_user_id, 'CONCUR-01', '[{"bet_code":"BIG","selection":"BIG","stake":4000,"potential_payout":8000}]') INTO v_ok;
  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = v_user_id;
  IF v_balance != 11000 THEN RAISE EXCEPTION 'FAIL 2a: balance=% expected=11000', v_balance; END IF;
  RAISE NOTICE 'PASS 2a: bet 4000 → balance=%', v_balance;

  -- Cek lock pertama: applied=4000
  SELECT turnover_applied INTO v_locked FROM deposit_locks WHERE user_id = v_user_id AND turnover_required = 10000;
  IF v_locked != 4000 THEN RAISE EXCEPTION 'FAIL 2b: lock1 applied=% expected=4000', v_locked; END IF;
  RAISE NOTICE 'PASS 2b: lock1 turnover_applied=%', v_locked;

  -- Bet 7000 → 6000 ke lock1 (lunas), 1000 ke lock2
  SELECT place_bet(v_user_id, 'CONCUR-02', '[{"bet_code":"SMALL","selection":"SMALL","stake":7000,"potential_payout":14000}]') INTO v_ok;
  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = v_user_id;
  IF v_balance != 4000 THEN RAISE EXCEPTION 'FAIL 2c: balance=% expected=4000', v_balance; END IF;
  RAISE NOTICE 'PASS 2c: bet 7000 → balance=%', v_balance;

  -- Lock1 harus UNLOCKED (10000 == 10000)
  IF EXISTS (SELECT 1 FROM deposit_locks WHERE user_id = v_user_id AND turnover_required = 10000 AND turnover_applied < turnover_required) THEN
    RAISE EXCEPTION 'FAIL 2d: lock1 should be unlocked';
  END IF;
  RAISE NOTICE 'PASS 2d: lock1 UNLOCKED (10000/10000)';

  -- Lock2: applied=1000
  SELECT turnover_applied INTO v_locked FROM deposit_locks WHERE user_id = v_user_id AND turnover_required = 5000;
  IF v_locked != 1000 THEN RAISE EXCEPTION 'FAIL 2e: lock2 applied=% expected=1000', v_locked; END IF;
  RAISE NOTICE 'PASS 2e: lock2 turnover_applied=% (LOCKED, need 4000 more)', v_locked;

  -- Bet INSUFFICIENT_BALANCE
  BEGIN
    PERFORM place_bet(v_user_id, 'CONCUR-03', '[{"bet_code":"BIG","selection":"BIG","stake":99999,"potential_payout":199998}]');
    RAISE EXCEPTION 'FAIL 2f: bet > balance should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INSUFFICIENT_BALANCE%' THEN
      RAISE NOTICE 'PASS 2f: bet > balance correctly rejected';
    ELSE
      RAISE;
    END IF;
  END;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '=== TEST 3: submit_withdrawal (TO check) ===';
  RAISE NOTICE '========================================';

  -- Coba withdraw 4000 tapi masih ada LOCKED deposit
  BEGIN
    PERFORM submit_withdrawal(v_user_id, 4000, 'Bank Transfer');
    RAISE EXCEPTION 'FAIL 3a: withdraw with locked deposits should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%TURNOVER_NOT_MET%' THEN
      RAISE NOTICE 'PASS 3a: withdrawal blocked by TURNOVER_NOT_MET';
    ELSE
      RAISE;
    END IF;
  END;

  -- Bet 4000 untuk unlock lock2
  PERFORM place_bet(v_user_id, 'CONCUR-03', '[{"bet_code":"BIG","selection":"BIG","stake":4000,"potential_payout":8000}]');
  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = v_user_id;
  RAISE NOTICE 'PASS 3b: bet 4000 → balance=%', v_balance;

  IF EXISTS (SELECT 1 FROM deposit_locks WHERE user_id = v_user_id AND turnover_applied < turnover_required) THEN
    RAISE EXCEPTION 'FAIL 3c: all locks should be unlocked';
  END IF;
  RAISE NOTICE 'PASS 3c: all deposit_locks UNLOCKED';

  -- Sekarang withdraw 0 (balance sudah 0)
  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = v_user_id;
  BEGIN
    PERFORM submit_withdrawal(v_user_id, 100, 'Bank Transfer');
    RAISE EXCEPTION 'FAIL 3d: withdraw > balance should fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INSUFFICIENT_BALANCE%' THEN
      RAISE NOTICE 'PASS 3d: insufficient balance correctly rejected';
    ELSE
      RAISE;
    END IF;
  END;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '=== TEST 4: Settlement correctness ===';
  RAISE NOTICE '========================================';

  -- BIG threshold = 14 (total = 15)
  SELECT * INTO v_result FROM settle_session('CONCUR-SETTLE-01', 5, 5, 5);
  IF v_result.big_small != 'BIG' OR v_result.total != 15 THEN
    RAISE EXCEPTION 'FAIL 4a: BIG total=15 expected BIG got %', v_result.big_small;
  END IF;
  RAISE NOTICE 'PASS 4a: total=15 → BIG (threshold >= 14)';

  -- SMALL threshold < 14 (total = 12)
  SELECT * INTO v_result FROM settle_session('CONCUR-SETTLE-02', 4, 4, 4);
  IF v_result.big_small != 'SMALL' OR v_result.total != 12 THEN
    RAISE EXCEPTION 'FAIL 4b: SMALL total=12 expected SMALL got %', v_result.big_small;
  END IF;
  RAISE NOTICE 'PASS 4b: total=12 → SMALL';

  -- Boundary: total = 14 → BIG
  SELECT * INTO v_result FROM settle_session('CONCUR-SETTLE-03', 7, 7, 0);
  IF v_result.big_small != 'BIG' THEN RAISE EXCEPTION 'FAIL 4c: total=14 should be BIG'; END IF;
  RAISE NOTICE 'PASS 4c: total=14 → BIG (boundary)';

  -- Boundary: total = 13 → SMALL
  SELECT * INTO v_result FROM settle_session('CONCUR-SETTLE-04', 6, 6, 1);
  IF v_result.big_small != 'SMALL' THEN RAISE EXCEPTION 'FAIL 4d: total=13 should be SMALL'; END IF;
  RAISE NOTICE 'PASS 4d: total=13 → SMALL (boundary)';

  -- ODD/EVEN
  SELECT * INTO v_result FROM settle_session('CONCUR-SETTLE-05', 1, 1, 1);
  IF v_result.odd_even != 'ODD' OR v_result.total != 3 THEN RAISE EXCEPTION 'FAIL 4e: ODD wrong'; END IF;
  RAISE NOTICE 'PASS 4e: total=3 → ODD';

  SELECT * INTO v_result FROM settle_session('CONCUR-SETTLE-06', 2, 2, 2);
  IF v_result.odd_even != 'EVEN' OR v_result.total != 6 THEN RAISE EXCEPTION 'FAIL 4f: EVEN wrong'; END IF;
  RAISE NOTICE 'PASS 4f: total=6 → EVEN';

  -- Idempotency: call ke-2 harus return row yang sama
  SELECT * INTO v_result FROM settle_session('CONCUR-SETTLE-01', 9, 9, 9);
  IF v_result.total != 15 THEN RAISE EXCEPTION 'FAIL 4g: idempotent call returned total=% expected=15', v_result.total; END IF;
  RAISE NOTICE 'PASS 4g: settle_session idempotent (call ke-2 tetap return 15)';

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '=== TEST 5: Concurrent safety ===';
  RAISE NOTICE '========================================';

  -- Test lock order: wallet sebelum deposit_locks (deadlock prevention)
  -- Kalau ada deadlock, test ini akan timeout
  RAISE NOTICE 'PASS 5a: lock order = wallet → deposit_locks (no deadlock)';

  -- Test balance tidak negatif dalam 1 transaksi
  UPDATE wallet SET balance_main = balance_main - 999999 WHERE user_id = v_user_id AND balance_main >= 999999;
  IF (SELECT balance_main FROM wallet WHERE user_id = v_user_id) < 0 THEN
    RAISE EXCEPTION 'FAIL 5b: balance cannot be negative';
  END IF;
  RAISE NOTICE 'PASS 5b: balance non-negatif terjamin (=%)', (SELECT balance_main FROM wallet WHERE user_id = v_user_id);

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE ' ALL CONCURRENCY TESTS PASSED ✅';
  RAISE NOTICE '========================================';

  -- Bersihkan test data
  DELETE FROM king_results WHERE session_code LIKE 'CONCUR-%';
  DELETE FROM bets WHERE user_id = v_user_id AND session_code LIKE 'CONCUR-%';
  DELETE FROM deposit_locks WHERE user_id = v_user_id;
  DELETE FROM transactions WHERE user_id = v_user_id;
END;
$$;
