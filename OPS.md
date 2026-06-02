# NUMBER9 Platform — Operasional & Disaster Recovery

---

## 1. Backup & Disaster Recovery

### RPO (Recovery Point Objective) & RTO (Recovery Time Objective)

| Tier | Komponen | RPO | RTO | Metode |
|------|----------|-----|-----|--------|
| **1** | Database (PostgreSQL) | 15 menit (PiTR) | **10 menit** (observed: 6 menit) | `supabase db dump --linked` + restore lokal |
| **2** | Edge Functions | 1 hari | 15 menit | Source code di Git + `supabase functions deploy` |
| **3** | Cloudflare Pages | 1 hari | 15 menit | Git-based deploy + version history Cloudflare |
| **4** | Secrets (.env, tokens) | 7 hari | 1 jam | Encrypted backup di vault |

### Preflight Checklist (Restore)

Sebelum restore, pastikan:

- [ ] Docker running (`docker info`)
- [ ] Supabase CLI installed (`supabase --version`)
- [ ] Project linked (`supabase db query --linked "SELECT 1"`)
- [ ] Backup file tersedia (`ls -lh /backup/*.dump`)
- [ ] Target database siap (`createdb` + hak akses)
- [ ] Reconciliation script siap (`daily_reconciliation()`)
- [ ] Regression tests siap (`scripts/regression-test.sql`)

### Database Backup Strategy

**Automatic (Supabase PiTR):**
- Supabase menyediakan Point-in-Time Recovery dengan window 7 hari
- Backup otomatis setiap 2 menit (WAL archiving)
- Restore ke titik waktu tertentu (detik presisi)
- **RPO aktual: ≤ 15 menit** (worst case dari PiTR)

**Manual (`supabase db dump --linked`):**
```bash
# Full backup (scheduled daily via cron)
supabase db dump --linked -f /backup/number9_$(date +%Y%m%d_%H%M%S).sql

# Data-only backup (untuk restore cepat)
supabase db dump --linked --data-only \
  -f /backup/number9_data_$(date +%Y%m%d).sql
```
  -t king_results \
  -t deposit_locks \
  -f /backup/number9_data_$(date +%Y%m%d).sql
```

### Database Recovery Procedure

#### 1. Point-in-Time Recovery (PiTR) — Recommended

Gunakan Supabase Dashboard:
1. Buka https://supabase.com/dashboard/project/dqsmpdetiqsqfnidekik
2. Navigasi ke **Database** → **Backups**
3. Klik **Restore** → pilih titik waktu
4. Konfirmasi — database akan di-restore ke project baru
5. Update connection string di `admin-proxy` dan React app

#### 2. Manual Restore via `supabase db dump --linked` (Recommended)

```bash
# 1. Backup dari production
supabase db dump --linked -f /backup/number9_$(date +%Y%m%d).sql

# 2. Buat database lokal
createdb number9_restore

# 3. Restore dari SQL dump
psql -d number9_restore -f /backup/number9_$(date +%Y%m%d).sql

# 4. Verifikasi
psql -d number9_restore -c "
  SELECT 'users' AS tbl, COUNT(*) FROM users
  UNION ALL SELECT 'wallet', COUNT(*) FROM wallet
  UNION ALL SELECT 'transactions', COUNT(*) FROM transactions
  UNION ALL SELECT 'bets', COUNT(*) FROM bets
  UNION ALL SELECT 'king_results', COUNT(*) FROM king_results
  UNION ALL SELECT 'deposit_locks', COUNT(*) FROM deposit_locks;
"
```

#### 3. Post-Recovery Checklist

Setelah restore, wajib verifikasi:

```bash
# 1. Regression test
supabase db query --linked --file scripts/regression-test.sql

# 2. Reconciliation
supabase db query --linked "SELECT * FROM daily_reconciliation(CURRENT_DATE);"

# 3. Cek balance integrity
supabase db query --linked "
SELECT count(*) = 0 FROM wallet WHERE balance_main < 0;
"

# 4. Cek engine status
supabase db query --linked "SELECT * FROM engine_status;"
```

### Disaster Scenarios

| Skenario | Dampak | Langkah |
|----------|--------|---------|
| Database corrupt | Semua transaksi berhenti | Restore PiTR ke 15 menit sebelum korupsi |
| Service role key bocor | Akses penuh ke DB | Rotasi key + audit log |
| Cloudflare account hilang | App tidak bisa diakses | Deploy ulang ke backup hosting |
| GitHub repository hilang | Source code hilang | Restore dari clone lokal + backup |

---

## 2. Secret Rotation

### Daftar Secret

| Secret | Lokasi | Rotasi | Dampak Jika Bocor |
|--------|--------|--------|-------------------|
| `N9_SERVICE_ROLE_KEY` | Supabase Edge Functions env | 90 hari | Akses penuh ke DB via admin-proxy |
| `SUPABASE_ANON_KEY` | `.env.user`, Cloudflare | 90 hari | Akses anon ke RPC |
| `JWT_SECRET` | Supabase project settings | 90 hari | Bisa generate JWT valid |
| `CLOUDFLARE_API_TOKEN` | GitHub Secrets | 180 hari | Deploy abuse |
| `SUPABASE_ACCESS_TOKEN` | GitHub Secrets | 180 hari | Akses manajemen Supabase |
| `GITHUB_TOKEN` | GitHub Secrets | Auto | — |

### Service Role Key Rotation

```bash
# 1. Generate new key di Supabase Dashboard
#    Project Settings → API → service_role key → Regenerate

# 2. Update admin-proxy environment
supabase secrets set N9_SERVICE_ROLE_KEY='<new_key>'

# 3. Redeploy admin-proxy
supabase functions deploy admin-proxy

# 4. Verifikasi
curl -X POST https://dqsmpdetiqsqfnidekik.supabase.co/functions/v1/admin-proxy \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <new_key>' \
  -d '{"method":"GET","path":"/users?limit=1"}'

# 5. Hapus key lama dari semua lokasi
```

### Anon Key Rotation

```bash
# 1. Regenerate di Supabase Dashboard

# 2. Update .env.user
sed -i "s/VITE_SUPABASE_KEY=.*/VITE_SUPABASE_KEY='<new_key>'/" NUMBER9/.env.user

# 3. Update deploy-cloudflare.sh
sed -i "s/NG_PUBLIC_SUPABASE_KEY=.*/NG_PUBLIC_SUPABASE_KEY='<new_key>'/" scripts/deploy-cloudflare.sh

# 4. Redeploy kedua app
npm run build && wrangler pages deploy

# 5. Update GitHub Secrets
gh secret set VITE_SUPABASE_KEY --body '<new_key>'
gh secret set NG_PUBLIC_SUPABASE_KEY --body '<new_key>'
```

### JWT Secret Rotation

```bash
# 1. Generate di Supabase Dashboard
#    Project Settings → API → JWT Secret → Regenerate

# 2. Semua session token existing menjadi invalid
#    User harus login ulang

# 3. Verifikasi login flow
curl -X POST https://dqsmpdetiqsqfnidekik.supabase.co/functions/v1/user-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"test","password":"test"}'
```

### Cloudflare Token Rotation

```bash
# 1. Generate new token di Cloudflare Dashboard
#    My Profile → API Tokens → Create Token (Pages:Read+Write)

# 2. Update GitHub Secrets
gh secret set CLOUDFLARE_API_TOKEN --body '<new_token>'

# 3. Verifikasi
npx wrangler whoami
```

---

## 3. Monitoring & Alerting

### Health Check Endpoint

```bash
# Cek status engine
supabase db query --linked "SELECT * FROM engine_status;"

# Expected output:
# - engine_status = 'RUNNING' (last result < 7 min ago)
# - engine_status = 'STALLED' (last result > 7 min ago)

# Cek reconciliation
supabase db query --linked "SELECT * FROM daily_reconciliation(CURRENT_DATE);"

# Expected: difference = 0
# Jika difference != 0 → security_alert terkirim otomatis
```

### Alert Thresholds

| Metric | Threshold | Action |
|--------|-----------|--------|
| `engine_status = 'STALLED'` | > 7 menit | Cek Angular admin dashboard |
| `reconciliation.difference != 0` | != 0 | Investigasi wallet mutation |
| `pending_deposit_count` | > 50 | Admin perlu approve deposit |
| `pending_withdraw_count` | > 50 | Admin perlu approve WD |
| `failed_rpc_count` | > 10/menit | Investigasi RPC error |
| `settlement_duration_ms` | > 1000ms | Optimasi settle_session query |

### Cron Jobs Aktif

```sql
SELECT jobname, schedule, command, last_run, next_run
FROM cron.job;
```

| Job | Schedule | Fungsi |
|-----|----------|--------|
| `daily-reconciliation` | `0 3 * * *` | Reconciliation harian |
| `snapshot-pending-counts` | `*/5 * * * *` | Snapshot pending deposit/WD |
| `king-engine-watchdog` | `*/5 * * * *` | Cek engine status + alert |
| `king-engine-prune` | `17 3 * * *` | Hapus metrics lama > 7 hari |

---

## 4. Deployment Checklist (Pre-Production)

Setiap deploy ke production, jalankan:

```bash
# 1. Regression test
supabase db query --linked --file scripts/regression-test.sql
# → Semua test harus PASSED

# 2. Reconciliation
supabase db query --linked "SELECT * FROM daily_reconciliation(CURRENT_DATE);"
# → difference harus 0

# 3. Cek pending transactions
supabase db query --linked "
SELECT type, status, count(*) FROM transactions
WHERE status IN ('PENDING')
GROUP BY type, status;
"

# 4. Cek engine hidup
supabase db query --linked "SELECT * FROM engine_status;"
# → engine_status harus 'RUNNING'

# 5. Deploy
bash scripts/ci.sh
# → Semua step harus sukses

# 6. Verifikasi production
curl -s https://admin.mynumber9.uk | head -5
curl -s https://app.mynumber9.uk | head -5
```
