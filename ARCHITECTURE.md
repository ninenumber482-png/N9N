# NUMBER9 Platform — Arsitektur & Flow

---

## Stack — 3 Layer

```
[CLIENT]                [EDGE FUNCTION]          [DATABASE]
React/Angular   ←→     admin-proxy / user-login  ←→  PostgreSQL
    ↑                          ↑                        ↑
  anon key              service_role key          SECURITY DEFINER RPCs
  + x-user-token        bypass RLS                bypass RLS
```

---

## Layer by Layer

### 1. Frontend — React (User App)
- **React 19 + Vite 8** → SPA di Cloudflare Pages
- **Zustand 5** → global state (auth, balance, transactions)
- **React Router 7** → routing `/c/:uuid/deposit`, `/c/:uuid/withdraw`, dll
- **TailwindCSS 4** → styling utility-first
- **Supabase JS Client** → anon key + `x-user-token` header (custom auth, bukan Supabase Auth)

### 2. Frontend — Angular (Admin App)
- **Angular standalone components + zoneless**
- **Admin-proxy** → semua API lewat Supabase Edge Function (service_role)
- **3D King engine** → tick 100ms, auto-generate planned draws, settle otomatis
- **Turnover analytics** → tampilkan `deposit_locks` per user

### 3. Backend — Supabase Edge Functions
- **admin-proxy** → proxy REST API ke Supabase dengan service_role key, validasi session via `sessions.token_hash`, rate limit 120/min, audit log
- **user-login** → validasi password bcrypt, generate session token 64-char hex, simpan di `users.session_token` (24h expiry)

### 4. Database — Supabase PostgreSQL
- **RLS**: Semua table pakai policy `users.session_token = current_setting('request.headers')::json->>'x-user-token'`
- **SECURITY DEFINER RPCs**: Fungsi SQL jalan sebagai superuser, bypass RLS, bisa dipanggil anon key via `supabase.rpc()`

**Tables kunci:**
| Table | Fungsi |
|-------|--------|
| `users` | Akun user, `session_token`, `session_expires_at` |
| `wallet` | `balance_main`, `total_deposited`, `total_turnover` |
| `transactions` | DEPOSIT/WITHDRAWAL, status PENDING/COMPLETED/REJECTED |
| `bets` | PENDING/SETTLED, `session_code`, `selection`, `stake`, `result` |
| `king_results` | `d1,d2,d3,total,big_small,odd_even` per session |
| `king_planned` | Admin-set digits per session (authoritative draw) |
| `deposit_locks` | Per-deposit turnover tracking (FIFO) |
| `sessions` | Login session dengan `token_hash` (dipakai admin-proxy) |

---

## Flow Fungsi

### 1. Auth Flow
```
User login → POST user-login EF → bcrypt verify password
                                 → generate 64-char session_token
                                 → simpan di users.session_token (24h expiry)
                                 → return { user, session: { access_token } }
Client     → setUserToken(access_token) → custom fetch injects x-user-token header
DB (RLS)   → policy: users.session_token = x-user-token
           → user cuma lihat data sendiri (wallet, transactions, bets)
```

### 2. Deposit Flow
```
User  → submit_deposit RPC → INSERT transactions SET status='PENDING'
Admin → approve_deposit RPC
         → UPDATE transactions SET status='COMPLETED'
         → UPDATE wallet SET balance_main += amount, total_deposited += amount
         → INSERT deposit_locks (amount, turnover_required=amount, turnover_applied=0)
```

### 3. Bet Flow
```
User  → place_bet RPC
         → FOR UPDATE wallet (lock row, cek balance_main)
         → IF balance < total_stake → RAISE INSUFFICIENT_BALANCE
         → debit balance_main -= total_stake
         → INSERT INTO bets (PENDING)
         → UPDATE wallet SET total_turnover += total_stake
         → UPDATE deposit_locks FIFO:
             FOR lock IN (oldest WHERE turnover_applied < turnover_required)
               apply = MIN(lock.turnover_required - lock.turnover_applied, v_remaining)
               lock.turnover_applied += apply
               v_remaining -= apply
```

### 4. Settlement Flow
```
Engine (100ms tick) → settle_session RPC
         → SELECT d1,d2,d3 FROM king_planned WHERE session_code = p_code (authoritative)
         → IF NOT FOUND → pakai p_d1, p_d2, p_d3 dari parameter
         → v_total = d1+d2+d3
         → v_bs = CASE WHEN v_total >= 14 THEN 'BIG' ELSE 'SMALL'
         → v_oe = CASE WHEN v_total % 2 = 1 THEN 'ODD' ELSE 'EVEN'
         → INSERT INTO king_results (session_code, d1,d2,d3,total,big_small,odd_even)
             ON CONFLICT (session_code) DO NOTHING
         → IF NOT FOUND → SELECT existing → RETURN (idempotent)
         → UPDATE bets SET status='SETTLED', result=WIN/LOSE, actual_payout
             WHERE session_code = p_code AND status = 'PENDING'
         → UPDATE wallet SET balance_main += win_sum (credit winners)
```

### 5. Withdrawal Flow
```
User  → submit_withdrawal RPC
         → FOR UPDATE wallet (cek balance_main)
         → SELECT COALESCE(SUM(turnover_required - turnover_applied),0)
             FROM deposit_locks WHERE turnover_applied < turnover_required
         → IF v_locked_remaining > 0 → RAISE TURNOVER_NOT_MET
         → IF balance < amount → RAISE INSUFFICIENT_BALANCE
         → debit balance_main -= amount
         → INSERT INTO transactions SET status='PENDING'

Admin → approve_withdrawal RPC
         → UPDATE transactions SET status='COMPLETED'
         → UPDATE wallet SET total_withdrawn += amount
         (balance sudah dipotong di submit, tidak dipotong lagi)

Admin → reject_withdrawal RPC
         → UPDATE transactions SET status='REJECTED'
         → UPDATE wallet SET balance_main += amount (REFUND)
```

### 6. Admin Override Flow
```
Admin klik B/S di tabel 3D King
  → overrideCategory(code, axis, value)
     → cur = this.planned.get(code) ?? rollDigits()
     → d = deriveDraw(cur.d1, cur.d2, cur.d3)
     → bs = (axis==='bs') ? value : d.bs
     → oe = (axis==='oe') ? value : d.oe
     → rolled = rollDigits(bs, oe)  → generate random digits sesuai kategori
     → this.filling.add(code)
     → this.planned.set(code, rolled)  → OPTIMISTIC UPDATE (langsung tampil)
     → this.pendingPlanWrites.add(code)  → PROTECT dari loadPlanned
     → this.admin.setPlanned(code, rolled.d1, rolled.d2, rolled.d3)  → upsert DB
     → .then(() => pendingPlanWrites.delete(code))  → DB confirmed
     → .catch(() => pendingPlanWrites.delete(code))  → error, notif admin

loadPlanned (setiap 3 detik):
     → for each row FROM DB:
         IF pendingPlanWrites.has(row.session_code) → SKIP (jangan overwrite)
         ELSE → map.set(row.session_code, row)  → merge DB value
```

### 7. Turnover Per-Deposit
```
deposit_locks table:
  id | user_id | deposit_id | amount | turnover_required | turnover_applied
  ───┼─────────┼────────────┼────────┼───────────────────┼────────────────
  1  | user_a  | tx_100     | 500    | 500               | 200    ← LOCKED
  2  | user_a  | tx_101     | 1000   | 1000              | 1000   ← UNLOCKED

Eligibility check (checkWithdrawEligibility / fetchTurnoverSummary):
  → SELECT FROM deposit_locks WHERE user_id = ?
  → Filter: hanya turnover_applied < turnover_required (LOCKED)
  → totalRequired = SUM(amount) = 500
  → totalApplied  = SUM(turnover_applied) = 200
  → remaining     = 500 - 200 = 300
  → isUnlocked    = false (masih ada remaining)

place_bet (FIFO apply):
  → FOR lock IN (oldest WHERE turnover_applied < turnover_required ORDER BY created_at)
      v_needed = lock.turnover_required - lock.turnover_applied
      v_apply  = LEAST(v_needed, v_remaining)
      UPDATE deposit_locks SET turnover_applied += v_apply WHERE id = lock.id
      v_remaining -= v_apply
```

---

## Keamanan

| Lapisan | Mekanisme |
|---------|-----------|
| Auth | `users.session_token` (64-char hex, 24h expiry, di-generate user-login EF) |
| Header | `x-user-token` dikirim tiap request via custom fetch (supabase.js) |
| RLS | `users.session_token = current_setting('request.headers')::json->>'x-user-token'` |
| RPC bypass | SECURITY DEFINER → jalan sebagai superuser (bypass RLS) |
| Rate limit | admin-proxy: 120 req/min per token (in-memory Map) |
| Idempotency | `idempotency_key` di deposit/withdrawal (UNIQUE constraint) |
| Atomic | `FOR UPDATE` + transaksi → no race condition |
| Lock order | `wallet → deposit_locks` (sama di place_bet & submit_withdrawal) |
| Withdrawal TO | `submit_withdrawal` cek `deposit_locks` → `RAISE TURNOVER_NOT_MET` |
| Double-spend | submit_withdrawal potong balance atomic (gak bisa dipake bet) |
| Button revert | `pendingPlanWrites` cegah loadPlanned overwrite optimistic update |
| Deposit lock UI | `lastDepositAt` persist di Zustand store (lintas navigasi) |

---

## Deploy

| Komponen | Command | Target |
|----------|---------|--------|
| Angular admin | `npm run build` → `wrangler pages deploy` | Cloudflare Pages (admin.mynumber9.uk) |
| React user | `cd NUMBER9 && npm run build` → `wrangler pages deploy` | Cloudflare Pages (app.mynumber9.uk) |
| Edge function | `supabase functions deploy admin-proxy` | Supabase |
| Migration SQL | `supabase db query --linked --file migration.sql` | Supabase PostgreSQL |

Semua RPCs: anon_exec = true (bisa dipanggil anon key dari React app).
Admin-proxy: service_role key (bypass RLS, hanya untuk Angular admin).
