-- =============================================================================
-- NUMBER9 Regression Test — settle_session
-- Jalankan: supabase db query --linked --file scripts/regression-test.sql
-- Expected: semua query return baris (bukan error)
-- =============================================================================

-- 1. Pastikan hanya ada 1 overload settle_session
SELECT 'TEST 1: overload count' as test,
       count(*) = 1 as passed
FROM pg_catalog.pg_proc
WHERE proname = 'settle_session';

-- 2. Pastikan signature yang benar (text, int, int, int → king_results)
SELECT 'TEST 2: correct signature' as test,
       pg_get_function_result(oid) = 'king_results'
       AND pg_get_function_arguments(oid) = 'p_code text, p_d1 integer, p_d2 integer, p_d3 integer'
       AND prosrc NOT LIKE '%digit1%'
       AND prosrc NOT LIKE '%result_total%'
       AND prosrc NOT LIKE '%>= 11%'
       AND prosrc LIKE '%>= 14%'
       AND prosrc LIKE '%d1%'
       AND prosrc LIKE '%d2%'
       AND prosrc LIKE '%d3%'
       AND prosrc LIKE '%total%'
       AND prosrc NOT LIKE '%settled_at%' as passed
FROM pg_catalog.pg_proc
WHERE proname = 'settle_session';

-- 3. Pastikan semua fungsi lain tidak ada referensi column lama
SELECT 'TEST 3: no digit1/digit2/digit3 in any function' as test,
       count(*) = 0 as passed
FROM pg_catalog.pg_proc
WHERE proname != 'settle_session'
  AND (prosrc ILIKE '%digit1%'
    OR prosrc ILIKE '%digit2%'
    OR prosrc ILIKE '%digit3%'
    OR prosrc ILIKE '%result_total%'
    OR prosrc ILIKE '%>= 11%');

-- 4. Pastikan table king_results pakai kolom yang benar
SELECT 'TEST 4: king_results column names' as test,
       bool_and(column_name IN ('d1','d2','d3','total','big_small','odd_even','session_code','created_at')) as passed
FROM information_schema.columns
WHERE table_name = 'king_results';

-- 5. Pastikan settle_session bisa dipanggil (return row dengan kolom benar)
SELECT 'TEST 5: settle_session returns d1/d2/d3' as test,
       COUNT(*) > 0 as passed
FROM (
  SELECT (settle_session('REGTEST-000000000000', 1, 2, 3)).*
) sub
WHERE d1 = 1 AND d2 = 2 AND d3 = 3;

-- 6. Pastikan king_results berisi data yang benar dari test call
SELECT 'TEST 6: king_results has correct test data' as test,
       d1 = 1 AND d2 = 2 AND d3 = 3 AND total = 6
       AND big_small = 'SMALL' AND odd_even = 'EVEN' as passed
FROM king_results
WHERE session_code = 'REGTEST-000000000000';

-- 7. Pastikan idempotency (call kedua tidak error, return sama)
SELECT 'TEST 7: settle_session idempotent' as test,
       COUNT(*) = 1 as passed
FROM (
  SELECT (settle_session('REGTEST-000000000000', 9, 9, 9)).*
) sub;

-- 8. Pastikan BIG threshold = 14
SELECT 'TEST 8: BIG threshold >= 14' as test,
       d1 = 5 AND d2 = 5 AND d3 = 5 AND total = 15 AND big_small = 'BIG' as passed
FROM (
  SELECT (settle_session('REGTEST-BIG-00000001', 5, 5, 5)).*
) sub;

-- 9. Pastikan SMALL threshold < 14
SELECT 'TEST 9: SMALL threshold < 14' as test,
       d1 = 4 AND d2 = 4 AND d3 = 4 AND total = 12 AND big_small = 'SMALL' as passed
FROM (
  SELECT (settle_session('REGTEST-SMALL-00001', 4, 4, 4)).*
) sub;

-- 10. Pastikan ODD benar
SELECT 'TEST 10: ODD parity' as test,
       odd_even = 'ODD' as passed
FROM (
  SELECT (settle_session('REGTEST-ODD-0000001', 1, 1, 1)).*
) sub;

-- 11. Pastikan EVEN benar
SELECT 'TEST 11: EVEN parity' as test,
       odd_even = 'EVEN' as passed
FROM (
  SELECT (settle_session('REGTEST-EVEN-000001', 2, 2, 2)).*
) sub;

-- 12. Bersihkan test data
DELETE FROM king_results WHERE session_code LIKE 'REGTEST-%';

-- =============================================================================
-- SUMMARY
-- =============================================================================
SELECT '=== REGRESSION TEST SUMMARY ===' as summary;
SELECT 'Semua test harus PASSED. Jika ada FAILED, jangan deploy.' as warning;
