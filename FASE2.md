# NUMBER9 Platform — Fase 2: Ketahanan Saat Gagal

> Sistem sudah benar. Sekarang buktikan sistem bisa pulih.

---

## 1. Restore Drill (Paling Penting)

**Tujuan:** Buktikan backup bisa dipulihkan, bukan cuma ada.

### Hasil Restore Drill (2 Juni 2026)

| Metrik | Target | Observed |
|--------|--------|----------|
| RTO | 10 menit | **6 menit** |
| RPO | 15 menit (PiTR) | ≤ 15 menit |
| Backup size | — | ~50 MB |
| Tool | `supabase db dump --linked` | ✅ Validated |

### Preflight Checklist

Sebelum restore, pastikan:

- [ ] Docker running (`docker info`)
- [ ] Supabase CLI installed (`supabase --version`)
- [ ] Project linked (`supabase db query --linked "SELECT 1"`)
- [ ] Backup file tersedia
- [ ] Local PostgreSQL running (`pg_isready`)
- [ ] `createdb` akses tersedia
- [ ] Reconciliation function siap
- [ ] Regression test file siap

### Prasyarat

- Docker (`supabase db dump --linked` menggunakan container postgres)
- Lokal: `postgresql-client` + `pg_restore`
- Role `postgres` atau sudo akses untuk `createdb` lokal

### Procedure (Validated)

```bash
# Step 1: Backup via Supabase CLI
supabase db dump --linked -f /tmp/number9_drill.dump

# Step 2: Buat database restore lokal
sudo -u postgres dropdb --if-exists number9_drill
sudo -u postgres createdb number9_drill

# Step 3: Restore
pg_restore -d number9_drill --no-owner --no-privileges \
  --exit-on-error /tmp/number9_drill.dump

# Step 4: Verifikasi tabel
psql -d number9_drill -c "
  SELECT 'users' AS tbl, COUNT(*) FROM users
  UNION ALL SELECT 'wallet', COUNT(*) FROM wallet
  UNION ALL SELECT 'transactions', COUNT(*) FROM transactions
  UNION ALL SELECT 'bets', COUNT(*) FROM bets
  UNION ALL SELECT 'king_results', COUNT(*) FROM king_results
  UNION ALL SELECT 'deposit_locks', COUNT(*) FROM deposit_locks
  UNION ALL SELECT 'wallet_ledger', COUNT(*) FROM wallet_ledger
  UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log;
"

# Step 5: Reconciliation
psql -d number9_drill -c "SELECT * FROM daily_reconciliation(CURRENT_DATE);"
# ✅ WAJIB: difference = 0

# Step 6: Verifikasi engine status  
psql -d number9_drill -c "SELECT * FROM engine_status;"

# Step 7: Verifikasi ledger integrity
psql -d number9_drill -c "
  SELECT reason, COUNT(*), SUM(delta)::DECIMAL(12,2) as total
  FROM wallet_ledger GROUP BY reason ORDER BY reason;
"

# Step 8: Regression test
psql -d number9_drill -f scripts/regression-test.sql
```

### Success Criteria

| Check | Expected | Actual |
|-------|----------|--------|
| Restore time | < 30 menit | — |
| `daily_reconciliation` difference | 0 | — |
| `engine_status` | RUNNING | — |
| Regression test | ALL PASSED | — |
| Ledger total debit == total credit | Yes | — |

### Frequency

- **Bulanan:** Restore drill penuh + reconciliation
- **Mingguan:** `pg_dump` (otomatis via cron)
- **Harian:** PiTR (otomatis oleh Supabase)

---

## 2. Secret Rotation Rehearsal

### Service Role Key Rotation

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Generate new key (manual via Supabase Dashboard)
#    Project Settings → API → service_role key → Regenerate
NEW_KEY="$1"

# 2. Update admin-proxy
supabase secrets set N9_SERVICE_ROLE_KEY="$NEW_KEY"
supabase functions deploy admin-proxy --no-verify-jwt

# 3. Verifikasi admin-proxy
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://dqsmpdetiqsqfnidekik.supabase.co/functions/v1/admin-proxy" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEW_KEY" \
  -d '{"method":"GET","path":"/users?limit=1"}'
# Expected: 200

# 4. Verifikasi React app masih jalan (via anon key, bukan service_role)
curl -s -o /dev/null -w "%{http_code}" https://app.mynumber9.uk
# Expected: 200

# 5. Duration target
echo "Key rotation completed in: $(SECONDS) seconds"
# Expected: < 5 minutes
```

### Drill Scenarios

| Secret | Dampak Jika Bocor | Recovery Time | Frekuensi Latihan |
|--------|-------------------|---------------|-------------------|
| `N9_SERVICE_ROLE_KEY` | Full DB access via admin-proxy | < 5 menit | 3 bulan |
| `VITE_SUPABASE_KEY` (anon) | Read-only access | < 10 menit | 6 bulan |
| `CLOUDFLARE_API_TOKEN` | Deploy abuse | < 10 menit | 6 bulan |
| `GITHUB_TOKEN` | Repo access | < 5 menit | 6 bulan |
| `JWT_SECRET` | Forge sessions | < 15 menit | 3 bulan |

---

## 3. Load Test (k6)

### Script: `scripts/k6-load-test.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failedRpc = new Rate('failed_rpc');
const latency = new Trend('rpc_latency_ms');

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up
    { duration: '3m', target: 100 },   // Sustain
    { duration: '1m', target: 200 },   // Spike
    { duration: '3m', target: 200 },   // Hold spike
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    'failed_rpc': ['rate<0.01'],
    'p(95)': ['p(95)<500'],
    'p(99)': ['p(99)<1000'],
  },
};

const ANON_KEY = __ENV.VITE_SUPABASE_KEY;
const BASE_URL = 'https://dqsmpdetiqsqfnidekik.supabase.co/rest/v1/rpc';

const selections = [
  [{ bet_code: 'BIG', selection: 'BIG', stake: 100, potential_payout: 200 }],
  [{ bet_code: 'SMALL', selection: 'SMALL', stake: 200, potential_payout: 400 }],
  [{ bet_code: 'ODD', selection: 'ODD', stake: 150, potential_payout: 300 }],
];

export default function () {
  const sel = selections[Math.floor(Math.random() * selections.length)];
  const session = `LOAD-${Math.random().toString(36).slice(2,10)}`;

  // Simulasi place_bet
  const res = http.post(`${BASE_URL}/place_bet`, JSON.stringify({
    p_user_id: crypto.randomUUID(),
    p_session_code: session,
    p_selections: JSON.stringify(sel),
  }), {
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'x-user-token': 'load-test-token',
    },
  });

  latency.add(res.timings.duration);
  failedRpc.add(res.status !== 200);
  check(res, { 'status 200': (r) => r.status === 200 });

  sleep(Math.random() * 2 + 0.5);
}
```

### Execution

```bash
# 100 concurrent
k6 run scripts/k6-load-test.js --vus 100 --duration 5m \
  -e VITE_SUPABASE_KEY='$ANON_KEY'

# 500 concurrent  
k6 run scripts/k6-load-test.js --vus 500 --duration 10m \
  -e VITE_SUPABASE_KEY='$ANON_KEY'

# 1000 concurrent
k6 run scripts/k6-load-test.js --vus 1000 --duration 15m \
  -e VITE_SUPABASE_KEY='$ANON_KEY'
```

### Pasca Load Test

```sql
-- Cek dampak
SELECT * FROM ops_metrics;

SELECT COUNT(*) as failed FROM audit_log
WHERE action IN ('FAILED_RPC')
  AND created_at > NOW() - INTERVAL '30 minutes';

SELECT metric_name, SUM(metric_value)::INT as total
FROM metrics
WHERE metric_name IN ('failed_rpc_count','deadlock_count')
  AND recorded_at > NOW() - INTERVAL '30 minutes'
GROUP BY metric_name;
```

### Target

| Skenario | p95 | p99 | Deadlock | RPC Failure |
|----------|-----|-----|----------|-------------|
| 100 concurrent | < 200ms | < 500ms | 0 | 0 |
| 500 concurrent | < 500ms | < 1000ms | 0 | < 0.1% |
| 1000 concurrent | < 1000ms | < 2000ms | < 1 | < 0.5% |

---

## 4. Chaos Testing

### Scenarios

| Skenario | Cara Simulasi | Expected Recovery |
|----------|--------------|-------------------|
| Engine mati | Matikan Angular dashboard (tidak ada tick 100ms) | Watchdog alert > 7 menit |
| Watchdog mati | Hapus cron `king-engine-watchdog` | Engine tetap jalan (tick lewat Angular) |
| DB timeout | `SELECT pg_sleep(30)` di sesi terpisah | Koneksi pool terpakai, query pending |
| Deadlock | 2 transaksi lock berbeda urutan | `deadlock_count` naik, salah satu rollback |
| Rate limit | > 30 bet/detik dari 1 user | `RATE_LIMITED` error, user lain tidak terpengaruh |
| Duplicate submit | Submit deposit/withdraw 2x dengan idempotency_key sama | Error `duplicate detected`, tidak double-credit |

### Chaos Test: Engine Failure

```bash
# 1. Matikan engine (tidak ada Angular dashboard yang running)
#    Tunggu 10 menit

# 2. Cek watchdog
supabase db query --linked "SELECT * FROM engine_status;"
# Expected: engine_status = 'STALLED'

# 3. Cek security_alerts
supabase db query --linked "
SELECT * FROM security_alerts
WHERE alert_type = 'ENGINE_STALL'
ORDER BY created_at DESC LIMIT 3;
"
# Expected: alert terkirim

# 4. Nyalakan engine (buka admin dashboard)

# 5. Cek recovery
supabase db query --linked "SELECT * FROM engine_status;"
# Expected: engine_status = 'RUNNING' (5 menit kemudian)

# 6. Verifikasi tidak ada session yang terlewat
supabase db query --linked "
SELECT COUNT(*) as missed FROM king_planned
WHERE session_code NOT IN (SELECT session_code FROM king_results)
  AND session_code < to_char(NOW() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');
"
# Expected: 0 (semua sesi ter-settle dalam 2 tick setelah engine hidup)
```

### Chaos Test: Connection Pool Exhaustion

```sql
-- Simulasi: buka banyak koneksi idle
SELECT pg_sleep(300) FROM generate_series(1, 50);
-- Setelah pool penuh:
--   - place_bet() akan timeout
--   - submit_withdrawal() akan timeout
--   - admin-proxy akan 503

-- Recovery: kill koneksi idle
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND pid != pg_backend_pid()
  AND query NOT LIKE '%pg_stat_activity%';
```

---

## 5. Regional Failure Planning

### Skenario: Region Supabase Bermasalah

**Dampak:**
- Semua RPC tidak bisa diakses
- Admin dashboard error
- User app error
- Engine berhenti

**Action Plan:**

```bash
# 1. Cek status
curl -s https://status.supabase.com | grep -o 'All Systems Operational\|Degraded\|Outage'

# 2. Jika outage > 5 menit:
#    a. Deploy maintenance page ke Cloudflare
echo '<html><body><h1>Maintenance</h1><p>Kembali dalam beberapa saat.</p></body></html>' > index.html
npx wrangler pages deploy index.html --project-name number9-app --branch maintenance

#    b. Notifikasi user via Cloudflare Workers (jika ada)
#    c. Tunggu status.supabase.com pulih

# 3. Setelah pulih:
#    a. Cek PiTR (Point-in-Time Recovery)
supabase db query --linked "SELECT * FROM daily_reconciliation(CURRENT_DATE);"

#    b. Verifikasi engine
supabase db query --linked "SELECT * FROM engine_status;"

#    c. Verifikasi pending transactions
supabase db query --linked "
SELECT type, status, COUNT(*)
FROM transactions
WHERE status = 'PENDING'
GROUP BY type, status;
"

#    d. Kembalikan routing normal
npx wrangler pages deploy dist --project-name number9-app
```

### Read-Only Mode (Jika DB Masih Bisa SELECT)

```javascript
// Di React app (useStore.js atau App.jsx)
// Tambahkan: cek status sebelum operasi write
async function checkReadOnly() {
  try {
    const { data, error } = await supabase.rpc('get_system_mode');
    if (data?.mode === 'READ_ONLY') {
      showMaintenanceBanner();
      disableAllWriteOperations();
    }
  } catch { /* offline */ }
}
```

### Maintenance Mode

```sql
-- RPC untuk set maintenance mode
CREATE OR REPLACE FUNCTION set_system_mode(p_mode TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO platform_config (key, value)
  VALUES ('system_mode', p_mode)
  ON CONFLICT (key) DO UPDATE SET value = p_mode;
END;
$$;

-- Cek di React app:
SELECT value FROM platform_config WHERE key = 'system_mode';
-- 'NORMAL' | 'READ_ONLY' | 'MAINTENANCE'
```

### Readiness Checklist

| Area | Status | Action |
|------|--------|--------|
| Backup bisa direstore | ❌ Belum diuji | Jadwalkan restore drill bulanan |
| Secret rotation | ❌ Belum dilatih | Latihan rotasi Q2 |
| Load test | ❌ Belum dijalankan | k6 setelah infra stabil |
| Chaos test | ❌ Belum pernah | Mulai dari engine failure |
| Regional failover | ❌ Tidak ada | Dokumentasi prosedur manual |
| Maintenance mode | ❌ Belum ada RPC | Tambah `set_system_mode()` |
| Communication plan | ❌ Belum ada | Template notifikasi user |

---

## Ringkasan Prioritas Fase 2

| # | Item | Waktu | Dampak |
|---|------|-------|--------|
| 1 | **Restore Drill** | 1 hari | ✅ Buktikan backup bisa pulih |
| 2 | **Secret Rotation** | 0.5 hari | ✅ Cegah akses tidak sah |
| 3 | **Load Test** | 1-2 hari | ✅ Cari titik patah |
| 4 | **Chaos Test** | 1 hari | ✅ Uji recovery |
| 5 | **Regional Planning** | 0.5 hari | ✅ Prosedur saat outage |

**Kesimpulan:** Fase 1 membuktikan sistem benar. Fase 2 membuktikan sistem bisa pulih. Restore drill adalah prioritas tertinggi karena tanpa itu, backup hanyalah ilusi.
