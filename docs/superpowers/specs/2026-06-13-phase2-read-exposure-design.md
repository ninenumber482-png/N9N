# Phase 2 — Close anon READ exposure on member tables (Design)

**Date:** 2026-06-13
**Status:** Design (execution deferred until approved + verified stage-by-stage)
**Risk:** HIGH — reworks the read path of a live money platform. A missed read or an imperfect RPC → user app goes blind (can't see balance/history). Must be staged with verification; never revoke a table's SELECT before its RPC replacement is live and verified.

---

## 1. Problem

RLS is off. The React user app (anon key, which is public) reads member tables **directly** via `.from()`, filtered by a client-supplied `user_id`. Nothing enforces that the `user_id` is the caller's. So **any visitor can read any user's data**:

- `users` (profile, KYC status, bank info), `wallet` (balances), `transactions` (deposits/withdrawals), `bets` (bet history).

Anon WRITE was already closed (Phase 1/1b). This phase closes anon READ of per-user data.

## 2. What already exists (verified)

- **Token mechanism:** React injects `x-user-token: <session_token>` on every request (`NUMBER9/src/utils/supabase.js`). The token is stored in `users.session_token` (+ `session_expires_at`).
- **Working building blocks:** `get_user_id()` (no args → reads `x-user-token` from `request.headers`, validates against `users`, returns the caller's `uuid`) and `get_my_profile()` (functional, 1597-char plpgsql, returns the caller's profile as jsonb). These prove the SECURITY DEFINER + header-token pattern works.
- **Already used pattern:** `get_public_config` RPC (Phase 1) shows the React→RPC migration shape.

## 3. React direct reads to migrate (from grep of NUMBER9/src)

| Table | Sensitivity | Action |
|-------|-------------|--------|
| `users` | per-user (profile/KYC/bank) | → RPC (`get_my_profile` exists; verify it returns all fields the app needs) |
| `wallet` | per-user (balance) | → new RPC `get_my_wallet` |
| `transactions` | per-user (history) | → new RPC `get_my_transactions` |
| `bets` | per-user (history) | → new RPC `get_my_bets` |
| `king_results` | **public** (draw numbers) | **keep anon SELECT** — not per-user |
| `platform_accounts` | shown to all users (deposit accounts) | **keep anon SELECT** — not per-user-sensitive |
| `support_tickets` | INSERT only (kept) | no read change |

## 4. Design

Replicate the `get_my_profile` pattern (SECURITY DEFINER, `SET search_path`, read `x-user-token` → `get_user_id()` → scope by that uuid). Granularity: **separate RPCs** per resource (cacheable, smaller, easier to verify) rather than one mega-RPC.

New RPCs (all GRANT EXECUTE TO anon; they self-scope via the token):
- `get_my_wallet()` → jsonb `{ balance_main, balance_bonus, total_turnover, ... }` for `get_user_id()`.
- `get_my_transactions(p_limit int default 100)` → jsonb array of the caller's transactions.
- `get_my_bets(p_limit int default 200)` → jsonb array of the caller's bets.
- (Confirm `get_my_profile()` covers what `users` reads need; extend if a field is missing.)

Each returns empty/error if `get_user_id()` is null (no/invalid token) — never returns another user's row.

## 5. Staged execution (each stage verified; app never breaks)

1. **Build RPCs** (`get_my_wallet/transactions/bets`) in a migration; GRANT anon. Apply. Verify each returns the caller's data when called with a valid `x-user-token`, and nothing without one. **No SELECT revoked yet — app still reads directly, unaffected.**
2. **Migrate React reads** → `.rpc('get_my_*')` in `wallet.js`, `userSlice.js`, `App.jsx`, `king.js`. Build + deploy React. Verify the user app shows balance/history correctly (login a test user, screenshot dashboard/history/wallet).
3. **Confirm prod serves the new build** (bundle hash), then **revoke anon SELECT** on `users`, `wallet`, `transactions`, `bets` (keep `king_results`, `platform_accounts`). Apply.
4. **Verify:** test user app fully works (reads via RPC); `GET /rest/v1/wallet` as anon → 401; anon cannot read another user's row anywhere.
5. **Rollback ready:** if step 3 breaks a read, re-GRANT anon SELECT on the affected table immediately (1 line) while fixing the RPC/React.

## 6. Out of scope / notes

- RLS (auth.uid()) is **not** viable here — the app uses a custom token, not Supabase GoTrue, so `auth.uid()` is null. RPC-with-token is the correct path.
- `king_results` / `platform_accounts` stay anon-readable (public data) unless the operator wants them gated too.
- The admin Angular app is unaffected (reads via admin-proxy/service_role).
- Verification of the user app requires logging in a (test) user — document the manual check if headless login is impractical.

## 7. Live impact

- New RPCs (additive, safe) + React redeploy + anon SELECT revoke on 4 tables (gated behind verified RPC migration). Each step waits for operator go; SELECT revoke is the only app-breaking-if-wrong step and is done last with rollback ready.
