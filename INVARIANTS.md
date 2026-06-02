# NUMBER9 Platform — Invariants

> Aturan yang **tidak boleh pernah dilanggar**. Setiap kode, migration, atau perubahan flow harus menjaga invariant ini.

---

## I1 — Balance Non-Negatif

`wallet.balance_main >= 0` SETIAP SAAT.

**Enforced by:**
- `place_bet`: `IF v_balance < v_total THEN RAISE INSUFFICIENT_BALANCE`
- `submit_withdrawal`: `IF v_balance < p_amount THEN RAISE INSUFFICIENT_BALANCE`
- `settle_session`: credit winners (`balance_main + payout`) — aman (hanya nambah)

**Violation jika:** Ada jalur potong balance tanpa cek `balance >= amount` terlebih dulu.

---

## I2 — Tidak Ada Double-Spend

Satu unit balance **tidak bisa dipakai untuk bet DAN withdrawal secara bersamaan**.

**Enforced by:**
- `place_bet` dan `submit_withdrawal` sama-sama pakai `FOR UPDATE wallet WHERE user_id = p_user_id` (row lock)
- Transaction isolation — yang kedua nunggu yang pertama selesai
- Balance sudah terpotong, yang kedua dapet balance yang sudah dikurangi

**Violation jika:** Ada celah di mana dua transaksi bisa potong balance yang sama tanpa saling nunggu (no `FOR UPDATE`, atau lock table beda).

---

## I3 — Withdrawal Harus Penuhi Turnover

User **tidak bisa withdraw** selama masih ada `deposit_locks` dengan `turnover_applied < turnover_required`.

**Enforced by:**
- `submit_withdrawal`:
  ```sql
  SELECT COALESCE(SUM(turnover_required - turnover_applied), 0) INTO v_locked_remaining
  FROM deposit_locks WHERE user_id = p_user_id AND turnover_applied < turnover_required FOR UPDATE;
  IF v_locked_remaining > 0 THEN RAISE EXCEPTION 'TURNOVER_NOT_MET: % remaining', v_locked_remaining;
  ```
- Pengecekan dilakukan **dalam transaksi yang sama** dengan potong balance (atomic)

**Violation jika:** Ada jalur withdrawal yang tidak cek `deposit_locks`, atau pengecekan bisa di-skip (error handling return isUnlocked: true tanpa cek ulang di RPC).

---

## I4 — Atomic Balance Change

Setiap perubahan `wallet.balance_main` harus dalam satu transaksi SQL dengan validasi.

**Enforced by:**
- Semua RPC (`place_bet`, `submit_withdrawal`, `approve_deposit`, `reject_withdrawal`, `settle_session`) menggunakan `SECURITY DEFINER` + `BEGIN/COMMIT` implisit
- `FOR UPDATE` lock row sebelum baca/tulis

**Violation jika:** Ada kode yang update balance langsung via `PATCH /wallet` tanpa validasi (admin `updateWalletRow` — **ini khusus untuk admin override, harus hati-hati**).

---

## I5 — Deposit Lock 15 Menit

Setelah submit deposit, user **tidak bisa submit deposit lagi** selama 15 menit.

**Enforced by:**
- Frontend: `DepositPage` → `activeLockTx` cek PENDING deposit dalam 15 menit
- `lastDepositAt` di Zustand store → persist lintas navigasi
- Fallback dari `deposit_locks` (walau istilahnya deposit lock beda dengan turnover lock)

**Violation jika:** User bisa submit 2+ deposit berbeda dalam waktu <15 menit.

---

## I6 — Idempotency Transaksi

Satu deposit/withdrawal **tidak boleh diproses dua kali**.

**Enforced by:**
- `idempotency_key` column di `transactions` dengan UNIQUE constraint
- `submit_deposit` / `submit_withdrawal`: duplicate key error `23505` → return error "already pending"
- `settle_session`: `INSERT INTO king_results ... ON CONFLICT (session_code) DO NOTHING`

**Violation jika:** Ada jalur insert transaksi tanpa `idempotency_key` atau tanpa UNIQUE constraint.

---

## I7 — Isolasi Data Per User

User **hanya bisa melihat data miliknya sendiri**.

**Enforced by:**
- RLS policy di semua table:
  ```sql
  users.session_token = current_setting('request.headers')::json->>'x-user-token'
  AND users.session_expires_at > now()
  ```
- `SECURITY DEFINER` RPCs bypass RLS tapi butuh `p_user_id` dan verify via session_token

**Violation jika:** Ada query SELECT tanpa filter `user_id` yang bisa diakses user, atau RPC yang bisa dipanggil dengan `p_user_id != user's own id`.

---

## I8 — Hasil Settlement Immutable

Setelah `settle_session` sukses, `king_results` untuk session tersebut **tidak boleh berubah**.

**Enforced by:**
- `INSERT INTO king_results ... ON CONFLICT (session_code) DO NOTHING` — hasil pertama yang menang
- `RETURNING * INTO v_row; IF NOT FOUND THEN SELECT * INTO v_row ... RETURN v_row;` — idempotent

**Violation jika:** Ada kode yang UPDATE atau DELETE `king_results` setelah di-insert.

---

## I9 — Turnover FIFO per Deposit

Turnover dari bet harus diterapkan ke deposit **paling tua yang masih LOCKED** (First-In-First-Out).

**Enforced by:**
- `place_bet`:
  ```sql
  FOR v_lock IN
    SELECT id, turnover_required, turnover_applied
      FROM deposit_locks WHERE user_id = p_user_id AND turnover_applied < turnover_required
      ORDER BY created_at ASC   -- FIFO
      FOR UPDATE
  LOOP ... END LOOP;
  ```

**Violation jika:** Ada kode yang apply turnover ke deposit secara random atau tidak urut.

---

## I10 — Admin Override Tidak Boleh Revert

Admin override kategori B/S atau O/E harus persist sampai settlement.

**Enforced by:**
- `pendingPlanWrites` Set — cegah `loadPlanned()` overwrite optimistic update yang masih in-flight
- `loadPlanned`:
  ```typescript
  if (this.pendingPlanWrites.has(r.session_code)) continue;  // SKIP
  ```
- Urutan: `planned.set()` (optimistic) → `pendingPlanWrites.add()` → `setPlanned()` (DB) → `pendingPlanWrites.delete()` (confirm)

**Violation jika:** Ada jalur di mana `this.planned` bisa di-update dengan nilai dari DB yang lebih lama dari nilai yang baru di-set admin (race condition).

---

## I11 — P&L Hanya dari SETTLED Bets

Perhitungan profit/loss user **hanya** dari bets yang statusnya `SETTLED`.

**Enforced by:**
- `HistoryPage.jsx`: filter `b.status !== "PENDING"`
- `SessionBetsInline` di `GamePage.jsx`: `allSettled = [...settled, ...prevBids]`
- `settle_session`: hanya update bets dengan `status = 'PENDING'`

**Violation jika:** Ada kode yang menghitung P&L termasuk bets PENDING.

---

## I12 — Validasi Digit 0-9

Setiap digit hasil draw harus antara 0-9.

**Enforced by:**
- Table constraint: `CHECK (d1 BETWEEN 0 AND 9)` di `king_results` dan `king_planned`
- `settle_session`: `v_d1, v_d2, v_d3` dari DB (king_planned) atau parameter
- `king_rand_digit()`: rejection sampling — `b := get_byte(gen_random_bytes(1), 0); EXIT WHEN b < 250`

**Violation jika:** Ada kode yang generate atau insert digit di luar range 0-9.

---

## I13 — BIG/SMALL Threshold Konsisten

Threshold BIG/SMALL harus **sama** di semua layer.

**Definisi:**
- **BIG**: `total >= 14` (14-27, 14/28 = 50%)
- **SMALL**: `total <= 13` (0-13, 14/28 = 50%)

**Enforced by:**
- `settle_session` (RPC): `CASE WHEN v_total >= 14 THEN 'BIG' ELSE 'SMALL' END`
- `deriveDraw` (Angular): `total >= 14 ? 'BIG' : 'SMALL'`
- `rollDigits` (Angular): `lo = bs === 'BIG' ? 14 : 0; hi = bs === 'SMALL' ? 13 : 27;`

**Violation jika:** Ada kode yang pakai threshold beda (misal `>= 11`). Payout 2x dengan threshold 11 memberi player edge 21%.

---

## I14 — Lock Order Konsisten

Semua transaksi yang lock wallet DAN deposit_locks harus lock dalam urutan yang sama.

**Urutan:**
1. `wallet FOR UPDATE`
2. `deposit_locks FOR UPDATE`

**Enforced by:**
- `place_bet`: lock wallet → lock deposit_locks
- `submit_withdrawal`: lock wallet → lock deposit_locks

**Violation jika:** Ada transaksi yang lock deposit_locks dulu baru wallet (deadlock risk).

---

## Ringkasan

| # | Invariant | Enforced By |
|---|-----------|-------------|
| I1 | Balance >= 0 | Cek di place_bet, submit_withdrawal |
| I2 | No double-spend | FOR UPDATE wallet + atomic |
| I3 | WD butuh TO | submit_withdrawal cek deposit_locks |
| I4 | Atomic balance change | RPC dalam 1 transaksi |
| I5 | Deposit lock 15 min | frontend + lastDepositAt |
| I6 | Idempotency | UNIQUE idempotency_key + ON CONFLICT |
| I7 | Data isolasi per user | RLS + session_token verify |
| I8 | Hasil immutable | ON CONFLICT DO NOTHING |
| I9 | Turnover FIFO per deposit | place_bet ORDER BY created_at |
| I10 | Override tidak revert | pendingPlanWrites |
| I11 | P&L hanya SETTLED | filter status di query |
| I12 | Digit 0-9 | CHECK constraint + rejection sampling |
| I13 | BIG/SMALL threshold >= 14 | sama di RPC, Angular, SQL |
| I14 | Lock order konsisten | wallet → deposit_locks |
