# NUMBER9 Performance Optimizations — Safe Deployment Guide

## ⚠️ PENTING: Deploy per fase, verify dulu sebelum lanjut ke fase berikutnya

---

## Fase 1: Indexes (PALING AMAN — Zero Risk)
**File:** `sql/01_indexes.sql`

- Hanya `CREATE INDEX CONCURRENTLY` — tidak lock table
- Tidak mengubah data, schema, atau API
- Bisa di-rollback dengan `DROP INDEX` jika perlu
- **Deploy:** Copy-paste ke Supabase SQL Editor → Run

**Expected impact:** RLS queries 10-50x lebih cepat

**Rollback:** `sql/01_indexes_rollback.sql`

---

## Fase 2: RPC Optimizations (AMAN — Signature Sama)
**File:** `sql/02_rpc_optimizations.sql`

- `check_rate_limit`: Counter table (1 write vs DELETE+COUNT+INSERT)
- `place_bet`: Batch UPDATE via CTE (ganti cursor loop)
- `daily_reconciliation`: Range query (ganti DATE() function)
- `king_engine_tick`: Batch existence check
- `engine_status` view: CTE dengan FILTER

**Semua function signature TIDAK BERUBAH.**

**Deploy:** `supabase db push` atau copy-paste ke SQL Editor

**Rollback:** `sql/02_rpc_rollback.sql`

---

## Fase 3: Frontend Optimizations (AMAN — Behavior Sama)

### 3a. RealtimeService + Components
**File:** `frontend/patches.diff`

- RealtimeService: Reference counting (fix memory leak)
- 3D King: Timer 100ms → 1000ms, polling 3s → 15s
- Components: Hapus redundant polling timers
- Sidebar: Badge polling 30s → 60s

**Deploy:**
```bash
git apply scripts/performance-optimizations/frontend/patches.diff
ng build --configuration production
```

**Rollback:**
```bash
git checkout -- src/app/core/services/realtime.service.ts \
  src/app/modules/dashboard/pages/3dking/3dking.component.ts \
  src/app/modules/layout/components/sidebar/sidebar.component.ts \
  src/app/modules/dashboard/pages/deposits/deposits.component.ts \
  src/app/modules/dashboard/pages/wallets/wallets.component.ts \
  src/app/modules/dashboard/pages/transactions/transactions.component.ts \
  src/app/modules/dashboard/pages/withdrawals/withdrawals.component.ts \
  src/app/modules/dashboard/pages/bets/bets.component.ts \
  src/app/modules/dashboard/pages/kyc/kyc.component.ts \
  src/app/modules/dashboard/pages/session-monitor/session-monitor.component.ts
```

### 3b. AdminService Cache
**File:** `frontend/admin-service-cache.diff`

- Cache TTL 5 detik untuk GET dan count requests

**Deploy:**
```bash
git apply scripts/performance-optimizations/frontend/admin-service-cache.diff
ng build --configuration production
```

**Rollback:**
```bash
git checkout -- src/app/core/services/admin.service.ts
```

---

## Fase 4: Edge Function Pagination (AMAN — Safety Net)
**File:** `edge-function/admin-proxy-patch.diff`

- Auto-enforce `limit=100` pada GET tanpa pagination

**Deploy:**
```bash
git apply scripts/performance-optimizations/edge-function/admin-proxy-patch.diff
supabase functions deploy admin-proxy
```

**Rollback:**
```bash
git checkout -- supabase/functions/admin-proxy/index.ts
supabase functions deploy admin-proxy
```

---

## Verification Checklist per Fase

- [ ] Query plan memakai index baru (`EXPLAIN ANALYZE`)
- [ ] `place_bet` latency tetap < 300ms
- [ ] `check_rate_limit` tidak error
- [ ] Engine tick tetap jalan tiap menit
- [ ] Frontend compile tanpa error
- [ ] Realtime subscription tetap aktif
- [ ] Admin dashboard tetap normal

---

## Emergency Rollback (Semua Fase)

```bash
# Database
cat scripts/performance-optimizations/sql/02_rpc_rollback.sql | psql $DATABASE_URL
cat scripts/performance-optimizations/sql/01_indexes_rollback.sql | psql $DATABASE_URL

# Frontend
git checkout -- src/app/core/services src/app/modules/

# Edge Function
git checkout -- supabase/functions/admin-proxy/
supabase functions deploy admin-proxy
```
