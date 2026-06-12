# Phase 2 — Close anon READ exposure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, recommended here because of live-deploy checkpoints) to implement task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Replace the React user app's direct anon reads of per-user member data (`users`, `wallet`, `transactions`, `bets`, referral network) with token-scoped SECURITY DEFINER RPCs, then revoke anon SELECT on those tables — so no visitor can read another user's data.

**Architecture:** Reuse the proven `get_user_id()` building block (reads `x-user-token` from `request.headers`, matches `sessions.token_hash` sha256 where not expired → returns the caller's uuid). New RPCs self-scope by that uuid and return jsonb. The React app calls them via `supabase.rpc(...)`. SELECT is revoked **last**, only after the RPCs + React are live and verified, with a 1-line re-GRANT rollback.

**Tech Stack:** Supabase Postgres (plpgsql SECURITY DEFINER RPC), React 19 + supabase-js, Cloudflare Pages.

**Verification:** Build + lint + targeted `curl`/`db query` (RPC returns caller data only) + run/screenshot the user app logged in as a test user. No Karma/Jest culture in this app — use build + live checks.

**Spec:** `docs/superpowers/specs/2026-06-13-phase2-read-exposure-design.md`

**Verified facts:**
- `get_user_id()` → uuid from `x-user-token` (sessions.token_hash). `get_my_profile()` already returns the caller's profile incl. `bankName/bankAccountNumber/bankAccountName`.
- React per-user reads (NUMBER9/src): `wallet.js:43` (wallet), `wallet.js:248` (users bank), `wallet.js:299` (transactions), `useStore.js:63` (wallet existence), `userSlice.js:183` (referral network = users where `referred_by_user`=me), `App.jsx:112` (transactions), `king.js:208` (king_results PUBLIC + bets).
- Columns: `wallet(balance_main,balance_bonus,total_deposited,total_withdrawn,total_turnover)`; `bets(id,session_code,bet_code,selection,stake,potential_payout,actual_payout,status,result,created_at,settled_at)`; `transactions(id,reference_code,type,amount,status,method,bank_name,bank_account_number,bank_account_name,proof_image_url,created_at,processed_at,notes)`.
- `king_results`, `platform_accounts` stay anon-readable (public, not per-user).

---

## Task 1: Build the token-scoped RPCs (additive — no SELECT revoked)

**Files:** Create `supabase/migrations/20260613050000_my_reads_rpcs.sql`.

- [ ] **Step 1: Write the migration**

```sql
-- Token-scoped read RPCs (self-scope via get_user_id() = x-user-token → uuid).
-- All GRANT EXECUTE TO anon; they NEVER return another user's data.

CREATE OR REPLACE FUNCTION public.get_my_wallet()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','NO_SESSION'); END IF;
  SELECT to_jsonb(w) INTO v FROM (
    SELECT balance_main, balance_bonus, total_deposited, total_withdrawn, total_turnover
    FROM wallet WHERE user_id = v_uid
  ) w;
  RETURN COALESCE(v, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_transactions(p_limit int DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT id, reference_code, type, amount, status, method, bank_name,
           bank_account_number, bank_account_name, proof_image_url,
           created_at, processed_at, notes
    FROM transactions
    WHERE user_id = v_uid AND type IN ('DEPOSIT','WITHDRAWAL')
    ORDER BY created_at DESC LIMIT GREATEST(1, LEAST(p_limit, 500))
  ) t;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_bets(p_limit int DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(b ORDER BY b.created_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT id, session_code, bet_code, selection, stake, potential_payout,
           actual_payout, status, result, created_at, settled_at
    FROM bets WHERE user_id = v_uid
    ORDER BY created_at DESC LIMIT GREATEST(1, LEAST(p_limit, 500))
  ) b;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_referrals()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT id, username, display_name, account_status, registration_status, created_at
    FROM users WHERE referred_by_user = v_uid
    ORDER BY created_at DESC
  ) r;
  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_my_wallet(), public.get_my_transactions(int),
  public.get_my_bets(int), public.get_my_referrals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_wallet(), public.get_my_transactions(int),
  public.get_my_bets(int), public.get_my_referrals() TO anon, authenticated, service_role;
```

- [ ] **Step 2: Apply the migration**

Run:
```bash
export PATH="$HOME/.local/share/supabase:$PATH"
cd /home/hemo/WEBSITE/N9NY-tailwind-N9
supabase db query --linked -f supabase/migrations/20260613050000_my_reads_rpcs.sql
```
Expected: `"rows": []`, no error.

- [ ] **Step 3: Verify the RPC works with a real user token (scopes to caller)**

Get a user token: log a test user in via `user-login`, capture its session token, then call the RPC through PostgREST with `x-user-token`. (If no test user/password is handy, verify instead that calling WITHOUT a token returns the no-session value.)
```bash
SUPABASE_URL="https://dqsmpdetiqsqfnidekik.supabase.co"; ANON_KEY="<anon>"
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/get_my_wallet" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'
```
Expected without token: `{"error":"NO_SESSION"}`. With a valid `x-user-token` header: that user's wallet object. **No SELECT revoked yet — app unaffected.**

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260613050000_my_reads_rpcs.sql
git commit -m "✨ db: RPC scoped get_my_wallet/transactions/bets/referrals (token)"
```

## Task 2: Migrate React reads to the RPCs

**Files:** Modify `NUMBER9/src/store/wallet.js`, `NUMBER9/src/store/king.js`, `NUMBER9/src/App.jsx`, `NUMBER9/src/store/slices/userSlice.js`, `NUMBER9/src/store/useStore.js`.

- [ ] **Step 1: wallet balance (`wallet.js:43`)**

Replace the `.from('wallet').select('balance_main,...').eq('user_id', userId).single()` block with:
```js
    const { data, error } = await supabase.rpc('get_my_wallet');
    if (!error && data && !data.error) {
      return {
        main: Number(data.balance_main ?? 0),
```
(keep the rest of the mapping; `data` is the wallet jsonb object.)

- [ ] **Step 2: bank info (`wallet.js:248`)** — use existing `get_my_profile`:
```js
    const { data, error } = await supabase.rpc('get_my_profile');
    if (!error && data && !data.error)
      return {
        bankName: data.bankName || '',
        // map data.bankAccountNumber, data.bankAccountName
```
(adjust the field reads to the camelCase keys `get_my_profile` returns: `bankName`, `bankAccountNumber`, `bankAccountName`.)

- [ ] **Step 3: transactions (`wallet.js:299` and `App.jsx:112`)** — replace both with:
```js
    const { data, error } = await supabase.rpc('get_my_transactions', { p_limit: 100 });
    const rows = Array.isArray(data) ? data : [];
```
then use `rows` where the old `data` array was used (same snake_case fields).

- [ ] **Step 4: bets (`king.js:208`)** — in the `Promise.all`, replace the bets branch:
```js
      userId ? supabase.rpc('get_my_bets', { p_limit: 200 }) : Promise.resolve({ data: [], error: null }),
```
and where `betsRes.data` is consumed, treat it as the jsonb array (same fields).

- [ ] **Step 5: referral network (`userSlice.js:183`)** — replace with:
```js
      const { data, error } = await supabase.rpc('get_my_referrals');
      if (error) { return [] }
      return Array.isArray(data) ? data : [];
```

- [ ] **Step 6: wallet existence (`useStore.js:63`)** — replace with `get_my_wallet`:
```js
                  const { data } = await supabase.rpc('get_my_wallet');
                  const hasWallet = data && !data.error && data.balance_main !== undefined;
                  if (!hasWallet) {
```
(adjust the following `if (!data || data.length === 0)` to `if (!hasWallet)`.)

- [ ] **Step 7: Build + lint**

Run:
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9/NUMBER9 && npm run build 2>&1 | grep -E "built in|error|Error" | head
npm run lint 2>&1 | tail -5
```
Expected: built, no new errors.

- [ ] **Step 8: Deploy React + verify the user app reads correctly**

```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9/NUMBER9 && npm run deploy 2>&1 | tail -3
```
Then log in a **test user** on `app.mynumber9.uk` and confirm Dashboard (balance), Wallet, History (transactions), bet history, and referral network all render. Screenshot each. **SELECT still granted — if an RPC is wrong, the app still has the old path? No — reads now go via RPC; so this step is the real test. If broken, fix the RPC/React before Task 3.**

- [ ] **Step 9: Commit**

```bash
git add NUMBER9/src
git commit -m "✨ user-app: lire wallet/transactions/bets/referrals via RPC scoped"
```

## Task 3: Revoke anon SELECT on per-user tables (LAST — gated by Task 2 verified)

**Files:** Create `supabase/migrations/20260613060000_revoke_anon_read_member_tables.sql`.

- [ ] **Step 1: Confirm prod serves the new React build** (bundle hash matches local `dist/index.html`). Only proceed if Task 2 verification passed.

- [ ] **Step 2: Write + apply the revoke**

```sql
-- Per-user data is now read only via token-scoped RPCs. Revoke anon SELECT.
-- king_results + platform_accounts stay readable (public, non-per-user).
REVOKE SELECT ON TABLE public.users, public.wallet, public.transactions, public.bets
  FROM anon, authenticated;
```
```bash
supabase db query --linked -f supabase/migrations/20260613060000_revoke_anon_read_member_tables.sql
```

- [ ] **Step 3: Verify**

```bash
# anon direct read now blocked:
curl -s -o /dev/null -w "anon GET wallet: %{http_code}\n" "$SUPABASE_URL/rest/v1/wallet?select=balance_main&limit=1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# RPC still works (with a valid token) → user app still reads its own data.
```
Expected: `anon GET wallet: 401`; user app (logged in) still shows balance/history. Re-screenshot the user app.

- [ ] **Step 4: Rollback (only if a read broke)**

```bash
supabase db query --linked "GRANT SELECT ON public.users, public.wallet, public.transactions, public.bets TO anon, authenticated;"
```
Then fix the offending RPC/React and retry.

- [ ] **Step 5: Commit + push**

```bash
git add supabase/migrations/20260613060000_revoke_anon_read_member_tables.sql
git commit -m "🔒 db: révoque SELECT anon sur users/wallet/transactions/bets (lecture via RPC)"
git push origin main
```

---

## Self-Review

- **Spec coverage:** users→get_my_profile (+ get_my_referrals for the downline read the spec missed); wallet→get_my_wallet; transactions→get_my_transactions; bets→get_my_bets; king_results/platform_accounts kept public; staged revoke last w/ rollback. Covered.
- **Placeholder scan:** RPC SQL is complete; React steps show the exact transformed code; the only soft spot is "log a test user in" for verification — documented as manual if headless login is impractical.
- **Type consistency:** RPC names `get_my_wallet/get_my_transactions/get_my_bets/get_my_referrals` used identically in Task 1 (defs), Task 2 (React calls), Task 3 (unaffected). `get_my_transactions(int)` / `get_my_bets(int)` signatures consistent in GRANT + React `{ p_limit }`.
- **Risk gate:** SELECT revoke (Task 3) is the only break-if-wrong step; gated behind Task 2 verification + 1-line rollback.
