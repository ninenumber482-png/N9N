# NUMBER9 Platform — Capacity Benchmark & Scaling

---

## 1. Arsitektur & Batasan

### Connection Pool

```
Supabase Postgres: max 50 connections (default project)
├── admin-proxy (service_role): ~5 koneksi
├── Angular admin (service_role via proxy): ~2 koneksi
├── React user (anon): ~43 koneksi tersisa
└── pg_cron jobs: ~1 koneksi
```

**Batasan:** Setiap koneksi yang dipakai = 1 proses backend. `supabase db query` juga memakai 1 koneksi.

### Lock Contention

Semua transaksi wallet menggunakan `FOR UPDATE` pada baris yang sama:

```
place_bet:        FOR UPDATE wallet WHERE user_id = X
submit_withdrawal: FOR UPDATE wallet WHERE user_id = X
ledger_balance:    FOR UPDATE wallet WHERE user_id = X
```

**Implikasi:** Untuk 1 user, semua transaksi **serial** — tidak bisa parallel. Ini aman (tidak ada race), tapi TPS per user terbatas.

### Rate Limiting

| RPC | Limit | Window |
|-----|-------|--------|
| `place_bet` | 30 calls | 60 detik |
| `submit_withdrawal` | 10 calls | 60 detik |

---

## 2. Estimasi Kapasitas

### Skenario: User biasa (5 bet/hari, 1 WD/hari)

| User | Daily Bets | Daily WD | Peak Concurrent | Expected TPS | Status |
|------|-----------|----------|-----------------|-------------|--------|
| 1.000 | 5.000 | 1.000 | ~50 | ~2 | ✅ Aman |
| 5.000 | 25.000 | 5.000 | ~250 | ~10 | ✅ Aman |
| 10.000 | 50.000 | 10.000 | ~500 | ~20 | ⚠️ Perlu load test |
| 25.000 | 125.000 | 25.000 | ~1.250 | ~50 | 🔴 Perlu optimasi |
| 50.000 | 250.000 | 50.000 | ~2.500 | ~100 | 🔴 Scaling |

### Skenario: Heavy user (50 bet/hari, 5 WD/hari)

| User | Daily Bets | Daily WD | Peak Concurrent | Expected TPS | Status |
|------|-----------|----------|-----------------|-------------|--------|
| 500 | 25.000 | 2.500 | ~250 | ~10 | ✅ Aman |
| 1.000 | 50.000 | 5.000 | ~500 | ~20 | ⚠️ Perlu load test |
| 5.000 | 250.000 | 25.000 | ~2.500 | ~100 | 🔴 Scaling |

**Bottleneck:** `FOR UPDATE wallet` — TPS maksimum per user = ~30 (rate limit). Untuk 5.000 user aktif, total TPS = user aktif × (1 bet / 2 detik) / concurrency factor.

---

## Load Test Results (Empiris)

### Test A — Sustained Write (5 VU, 15 detik, sleep 3s)

| Metrik | Value |
|--------|-------|
| Requests | 25 |
| Status 200 | **100%** |
| Failure rate | **0%** |
| p50 latency | **183ms** |
| p90 latency | **197ms** |
| p95 latency | **219ms** |
| p99 (max observed) | **231ms** |
| Throughput | 1.54 req/s |
| Deadlock (`deadlock_count`) | **0** |
| RPC error (`failed_rpc_count`) | **0** |

### Test B — Burst / Rate Limit Edge (45 rapid fire, 1 VU)

| Metrik | Value |
|--------|-------|
| Requests | 45 (30 success + 15 blocked) |
| Success rate | **66.7%** (30/45) |
| Blocked by rate limit | **33.3%** (15/45) |
| p95 latency (success calls) | **200ms** |
| Rate limit threshold | 30/min ✅ Tepat |
| Deadlock | **0** |
| RPC error (beyond rate limit) | **0** |

### Test C — Read (10 VU, 40 detik)

| Metrik | Value |
|--------|-------|
| Requests | 762 |
| Failure rate | **0%** |
| p50 latency | 233ms |
| p95 latency | 1.16s |
| Throughput | 19 req/s |

### Interpretasi

- **Write path `place_bet` stabil di p95 < 220ms** termasuk: auth check, FOR UPDATE wallet, balance deduct, ledger insert, deposit_lock FIFO, audit trigger
- **Rate limit berfungsi:** tepat 30 sukses, 15 ditolak — tidak ada over-count atau under-count
- **0 deadlock** — lock order konsisten (wallet → deposit_locks) ✅
- **0 RPC error** di luar rate limit — tidak ada exception dari logic bisnis

---

## 3. Saran Scaling

### Jangka Pendek (1.000–10.000 user)

| Area | Saran |
|------|-------|
| Connection pool | Naikkan ke 100–200 di Supabase |
| Rate limit | Sesuaikan per tier (VIP: 60/min, biasa: 15/min) |
| Monitoring | `ops_metrics` + alert jika `settlement_duration_ms > 500` |

### Jangka Menengah (10.000–50.000 user)

| Area | Saran |
|------|-------|
| Read replicas | Query `king_results`, `transactions` dari replica |
| Sharding | Pisahkan wallet per shard (user_id hash) |
| Caching | Cache `king_results` + `engine_status` di Redis |
| Queue | `submit_withdrawal` → antrian, bukan langsung debit |

### Jangka Panjang (50.000+ user)

| Area | Saran |
|------|-------|
| Microservices | Pisahkan engine, wallet, settlement |
| Kafka/Event Bus | Async settlement + audit trail |
| Database | Dedicated Postgres (bukan Supabase shared) |

---

## 4. Load Test dengan k6

Untuk benchmark nyata, jalankan k6 terhadap admin-proxy:

```javascript
// scripts/k6-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // ramp up
    { duration: '5m', target: 100 },  // sustain
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const url = 'https://dqsmpdetiqsqfnidekik.supabase.co/functions/v1/admin-proxy';
  const payload = JSON.stringify({
    method: 'POST',
    path: '/rpc/place_bet',
    body: { p_user_id: '...', p_session_code: '...', p_selections: [...] },
  });

  const res = http.post(url, payload, {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ${ANON_KEY}' },
  });

  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

Jalankan:
```bash
k6 run scripts/k6-load-test.js --vus 100 --duration 5m
```

---

## 5. Rekomendasi

1. **Segera:** Monitor `ops_metrics.failed_rpc_count` dan `settlement_duration_ms` — 2 metrik paling indikatif
2. **Minggu ini:** Jalankan k6 load test minimal 100 VU
3. **Bulan ini:** Jika traffic > 5.000 user/hari, naikkan connection pool + siapkan replica
4. **Kuartal ini:** Jika > 25.000 user/hari, mulai arsitektur ulang dengan event-driven

**Kesimpulan:** Dengan hardening yang sudah dilakukan, sistem siap untuk 1.000–5.000 user tanpa perubahan arsitektur. Di atas itu perlu load test nyata dan optimasi bertahap.
