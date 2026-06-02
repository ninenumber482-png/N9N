# NUMBER9 — Risk Register

> Status: Fase 1 (Feature/Financial Integrity) ✅ Selesai
> Fokus: Fase 2 (Operational Resilience)

---

## Risk Matrix

| ID | Risiko | Dampak | Probabilitas | Level | Mitigasi |
|----|--------|--------|-------------|-------|----------|
| R01 | Throughput belum terukur | Degradasi saat traffic spike | Medium | **P2** | Load test k6 |
| R02 | Regional Supabase outage | Semua layanan down | Low | **P2** | Maintenance mode + communication plan |
| R03 | Human error saat restore | Data loss atau inconsistent | Medium | **P2** | Preflight checklist + drill berkala |
| R04 | Secret rotation tidak sesuai SOP | Akses tidak sah atau downtime | Low | **P2** | Prosedur terdokumentasi |
| R05 | Engine watchdog diabaikan | Settlement berhenti tanpa notif | Medium | **P2** | `engine_status` view + security_alerts |
| R06 | Reconciliation gap tidak diinvestigasi | Balance tidak akurat | Low | **P3** | Alert harus di-resolve manual |

---

## Detail Risiko

### R01 — Unknown Throughput Ceiling

**Deskripsi:** Belum diketahui secara empiris performa sistem pada 100/500/1000 concurrent user.

**Indikator:**
- `ops_metrics.settlement_duration_ms` meningkat > 500ms
- `ops_metrics.failed_rpc_count` > 0
- `ops_metrics.deadlock_count` > 0

**Mitigasi:**
- Load test dengan k6 (script di `BENCHMARK.md`)
- Target: p95 < 500ms, deadlock = 0, failure rate < 0.1%

**Status:** ⏳ Menunggu eksekusi load test

### R02 — Regional Supabase Outage

**Deskripsi:** Platform bergantung pada Supabase region `ap-southeast-1`. Jika region down, semua RPC tidak bisa diakses.

**Dampak:**
- ❌ Read/write database
- ❌ Admin dashboard
- ❌ User app

**Mitigasi:**
- ✅ Maintenance mode: `set_system_mode('MAINTENANCE')`
- ✅ Read-only mode: jika DB masih SELECT
- ✅ Communication plan: notifikasi user via Cloudflare Pages maintenance page

**Status:** ✅ Prosedur terdokumentasi di `OPS.md` & `FASE2.md`

### R03 — Human Error Saat Restore

**Deskripsi:** Restore dilakukan tergesa-gesa tanpa mengikuti SOP, menyebabkan data inconsistent.

**Mitigasi:**
- ✅ Preflight checklist (Docker, CLI, backup, target DB, reconciliation)
- ✅ Restore drill validated (RTO 6 menit)
- ✅ Post-restore verification: reconciliation + regression test

**Status:** ✅ Prosedur validated, perlu drill bulanan

### R04 — Secret Rotation Tidak Sesuai SOP

**Deskripsi:** Rotasi service_role/Cloudflare/GitHub secrets dilakukan tanpa verifikasi, menyebabkan downtime atau akses tidak sah.

**Mitigasi:**
- ✅ Prosedur step-by-step di `OPS.md`
- ✅ Rehearsal selesai (23 detik deploy + verify)
- ✅ Post-rotation verification: admin-proxy, React app

**Status:** ✅ Prosedur siap

### R05 — Engine Watchdog Diabaikan

**Deskripsi:** `engine_status` menunjukkan STALLED tetapi tidak ditindaklanjuti, menyebabkan settlement berhenti dalam waktu lama.

**Indikator:**
- `engine_status.engine_status = 'STALLED'`
- `security_alerts.alert_type = 'ENGINE_STALL'`

**Mitigasi:**
- ✅ `ops_metrics` view mencakup `king_engine_result_age_sec`
- ✅ `security_alerts` tercatat otomatis
- ✅ Engine pulih otomatis dalam 2 tick (< 1 detik) setelah admin dashboard dibuka

**Status:** ✅ Monitoring aktif

### R06 — Reconciliation Gap Tidak Diinvestigasi

**Deskripsi:** `daily_reconciliation()` mendeteksi mismatch > 0 tetapi tidak di-resolve, menyebabkan akumulasi gap yang tidak terlacak.

**Indikator:**
- `security_alerts.alert_type = 'LEDGER_MISMATCH'` dan `resolved_at IS NULL`

**Mitigasi:**
- ✅ Alert tercatat otomatis di `security_alerts`
- ✅ Gap tervisualisasi di `daily_reconciliation()`
- ⚠️ Belum ada SLA resolve time

**Status:** ⚠️ Perlu menetapkan SLA: resolve < 24 jam

---

## SLA Target

| Metrik | Target | Monitoring |
|--------|--------|------------|
| RTO (database restore) | < 10 menit | ✅ Terbukti: 6 menit |
| RPO (data loss) | < 15 menit | ✅ PiTR |
| Reconciliation difference | 0 | ✅ Alert jika != 0 |
| Reconciliation resolve | **< 24 jam** | ⏳ Perlu SOP |
| Engine uptime | > 99.9% | ✅ `engine_status` |
| Load test p95 | < 500ms | ✅ Terbukti: 219ms (5 concurrent, write path) |
| Secret rotation | < 5 menit | ✅ Terbukti: ~3 menit |
| Alert response | < 1 jam | ⚠️ Perlu SOP |

---

## Timeline

| Timeline | Item | Status |
|----------|------|--------|
| **Sekarang** | Restore drill validated | ✅ |
| **Sekarang** | Load test k6 (p95 219ms, 0 deadlock) | ✅ |
| **Minggu ini** | Secret rotation real rehearsal | ⏳ |
| **Bulan ini** | Regional failover drill | ⏳ |
| **Berkala** | Restore drill bulanan (tiap awal bulan) | ⏳ Jadwalkan |
