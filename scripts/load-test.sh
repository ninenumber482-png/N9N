#!/usr/bin/env bash
# =============================================================================
# NUMBER9 — SQL Load Test
# Simulasi concurrent user: deposit → bet → withdraw
# Parameter: USERS, BETS_PER_USER, CONCURRENT
#
# Usage:
#   bash scripts/load-test.sh           # default: 100 users, 5 bets each
#   USERS=500  bash scripts/load-test.sh
#   USERS=1000 BETS=10 bash scripts/load-test.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USERS="${USERS:-100}"
BETS="${BETS:-5}"
CONCURRENT="${CONCURRENT:-10}"
RESULTS="/tmp/number9-loadtest-$(date +%s)"
mkdir -p "$RESULTS"

echo "============================================"
echo " NUMBER9 Load Test"
echo "============================================"
echo "Users:       $USERS"
echo "Bets/user:   $BETS"
echo "Concurrent:  $CONCURRENT"
echo "Results:     $RESULTS"
echo "============================================"
echo ""

# ── Setup test users ────────────────────────────────────────────────────────
echo "=== Setup $USERS test users ==="
supabase db query --linked -o csv "
SELECT gen_random_uuid()::text as id FROM generate_series(1, $USERS) AS gen;
" 2>/dev/null | tail -n +2 > "$RESULTS/user_ids.txt" || true

count=$(wc -l < "$RESULTS/user_ids.txt")
echo "  Created $count user IDs"
if [ "$count" -lt "$USERS" ]; then
  echo "  ERROR: Not enough user IDs generated. Aborting."
  exit 1
fi
echo ""

# ── Phase 1: Deposit ────────────────────────────────────────────────────────
echo "=== Phase 1: Deposit ($USERS deposits) ==="
# Create test data: users + wallet + submit deposits
{
  echo "BEGIN;"
  echo "DO \$\$"
  echo "DECLARE"
  echo "  v_uid UUID;"
  echo "  v_txid UUID;"
  echo "BEGIN"
  USER_COUNT=0
  while read uid; do
    USER_COUNT=$((USER_COUNT + 1))
    echo "  v_uid := '$uid';"
    echo "  INSERT INTO users (id, username, display_name, role, account_status, registration_status, login_status, kyc_status, session_token, session_expires_at, password_hash)"
    echo "  VALUES (v_uid, 'load_${USER_COUNT}', 'Load User ${USER_COUNT}', 'user', 'ACTIVE', 'APPROVED', 'ACTIVE', 'APPROVED', 'load-token-${USER_COUNT}', NOW() + INTERVAL '1 day', '\$2a\$10\$dummy');"
    echo "  INSERT INTO wallet (user_id, balance_main) VALUES (v_uid, 0) ON CONFLICT (user_id) DO UPDATE SET balance_main = 0;"
    echo "  SELECT gen_random_uuid() INTO v_txid;"
    echo "  INSERT INTO transactions (id, user_id, type, amount, status, method) VALUES (v_txid, v_uid, 'DEPOSIT', 10000, 'PENDING', 'Bank Transfer');"
    echo "  PERFORM approve_deposit(v_txid, '00000000-0000-0000-0000-000000000000');"
  done < "$RESULTS/user_ids.txt"
  echo "END; \$\$;"
  echo "COMMIT;"
} > "$RESULTS/phase1_deposit.sql"

time_start=$(date +%s%N)
supabase db query --linked --file "$RESULTS/phase1_deposit.sql" 2>&1 | tail -1
time_end=$(date +%s%N)
duration=$(echo "scale=2; ($time_end - $time_start) / 1000000000" | bc)
echo "  Duration: ${duration}s"
echo ""

# ── Phase 2: Concurrent Bets ────────────────────────────────────────────────
echo "=== Phase 2: Concurrent Bets (${BETS} bets/user × ${USERS} users) ==="
mkdir -p "$RESULTS/bets"
time_start=$(date +%s%N)

BATCH=1
while IFS= read -r uid; do
  for b in $(seq 1 "$BETS"); do
    STAKE=$(( (b % 5 + 1) * 100 ))  # 100, 200, 300, 400, 500
    SESSION="LOADTEST-$(date +%s)-${BATCH}"
    cat >> "$RESULTS/bets/batch_${BATCH}.sql" <<EOSQL
SELECT place_bet('${uid}', '${SESSION}', '[{"bet_code":"BIG","selection":"BIG","stake":${STAKE},"potential_payout":$((STAKE * 2))}]');
EOSQL
    BATCH=$((BATCH + 1))
  done
done < "$RESULTS/user_ids.txt"

TOTAL_BETS=$((USERS * BETS))
echo "  Total bets: $TOTAL_BETS"

# Execute batches concurrently
FAILED_BETS=0
for f in "$RESULTS/bets"/batch_*.sql; do
  if ! supabase db query --linked -f "$f" 2>/dev/null; then
    FAILED_BETS=$((FAILED_BETS + 1))
  fi &
  
  # Limit concurrent jobs
  if [ $(jobs -r | wc -l) -ge "$CONCURRENT" ]; then
    wait -n || true
  fi
done
wait

time_end=$(date +%s%N)
duration=$(echo "scale=2; ($time_end - $time_start) / 1000000000" | bc)
tps=$(echo "scale=0; $TOTAL_BETS / $duration" | bc)
echo "  Duration: ${duration}s"
echo "  TPS: $tps bets/sec"
echo "  Failed: $FAILED_BETS bets"
echo ""

# ── Phase 3: Withdrawals ────────────────────────────────────────────────────
echo "=== Phase 3: Concurrent Withdrawals ==="
time_start=$(date +%s%N)
FAILED_WD=0
BATCH=1
while IFS= read -r uid; do
  cat > "$RESULTS/wd_batch_${BATCH}.sql" <<EOSQL
SELECT submit_withdrawal('${uid}', 1000, 'Bank Transfer');
EOSQL
  BATCH=$((BATCH + 1))
done < "$RESULTS/user_ids.txt"

for f in "$RESULTS"/wd_batch_*.sql; do
  if ! supabase db query --linked -f "$f" 2>/dev/null; then
    FAILED_WD=$((FAILED_WD + 1))
  fi &
  if [ $(jobs -r | wc -l) -ge "$CONCURRENT" ]; then
    wait -n || true
  fi
done
wait

time_end=$(date +%s%N)
duration=$(echo "scale=2; ($time_end - $time_start) / 1000000000" | bc)
echo "  Duration: ${duration}s"
echo "  Failed: $FAILED_WD withdrawals"
echo ""

# ── Metrics Collection ──────────────────────────────────────────────────────
echo "=== Metrics After Load Test ==="
supabase db query --linked -o csv "
SELECT metric_name, SUM(metric_value)::INT as total
FROM metrics
WHERE metric_name IN ('failed_rpc_count','deadlock_count')
  AND recorded_at > NOW() - INTERVAL '10 minutes'
GROUP BY metric_name
ORDER BY metric_name;
" 2>/dev/null

echo ""
echo "=== Settlement Duration Stats ==="
supabase db query --linked -o csv "
SELECT
  COUNT(*) as settlements,
  ROUND(AVG(metric_value)::numeric, 2) as avg_ms,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value)::numeric, 2) as p50_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value)::numeric, 2) as p95_ms,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY metric_value)::numeric, 2) as p99_ms
FROM metrics
WHERE metric_name = 'settlement_duration_ms'
  AND recorded_at > NOW() - INTERVAL '10 minutes';
" 2>/dev/null

echo ""
echo "============================================"
echo " Load Test Complete"
echo " Results: $RESULTS"
echo "============================================"

# ── Cleanup test data ───────────────────────────────────────────────────────
echo ""
echo "=== Cleanup ==="
supabase db query --linked "
DELETE FROM deposit_locks WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'load_%');
DELETE FROM bets WHERE session_code LIKE 'LOADTEST-%';
DELETE FROM wallet_ledger WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'load_%');
DELETE FROM transactions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'load_%');
DELETE FROM wallet WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'load_%');
DELETE FROM users WHERE username LIKE 'load_%';
" 2>/dev/null
echo "  Test data cleaned up"
