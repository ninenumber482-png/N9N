# Gateway Activation Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a near-real-time list, on the Deposits page, of users who just activated the deposit gateway (clicked "Check / Load System") — with account + amount — so incoming BCA transfers can be reconciled to the right user.

**Architecture:** Extend the existing login-gated `get_deposit_account()` RPC to **upsert** one row per user into a new `gateway_activations` table on each successful reveal. Admin reads recent rows (last 15 min) via the `admin-proxy` (service_role) and renders a live strip polling every 10s on the Deposits tab. React DepositTab passes the typed amount.

**Tech Stack:** Supabase Postgres (plpgsql SECURITY DEFINER), Deno edge (`admin-proxy`), React/Zustand (user), Angular 22 zoneless + PrimeNG (admin).

**Verification model:** No JS unit runner in this repo; migrations are **not** applied to live by the implementer. Verify with: SQL **check-queries** (after the engineer applies to a local/test project), `npm run build` (both apps), `npx eslint <file>`. Do **not** apply this migration to live project `dqsmpdetiqsqfnidekik` unless the user explicitly says so. Note: `get_deposit_account()` (no-arg) is ALREADY live; the migration drops it and recreates with `p_amount numeric DEFAULT NULL`, which keeps existing no-arg calls working.

**Shared contract — a gateway activation row:** `{ user_id, username, account_label, amount, activated_at }` (amount may be null).

---

### Task 1: Migration — `gateway_activations` table + extend `get_deposit_account`

**Files:**
- Create: `supabase/migrations/20260614090000_gateway_activation_monitor.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Gateway Activation Monitor — live deposit reconciliation. Additive + a
-- backward-compatible signature change to get_deposit_account. NOT YET APPLIED.
-- Spec: docs/superpowers/specs/2026-06-14-gateway-activation-monitor-design.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gateway_activations (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username      text NOT NULL DEFAULT '',
  account_label text,
  amount        numeric,
  activated_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gateway_activations_at ON public.gateway_activations(activated_at DESC);
REVOKE ALL ON public.gateway_activations FROM anon, authenticated;  -- admin/service_role only

-- get_deposit_account() (no-arg) is live; drop it and recreate with p_amount
-- (DEFAULT NULL → existing no-arg calls keep working; avoids ambiguous overload).
DROP FUNCTION IF EXISTS public.get_deposit_account();

CREATE OR REPLACE FUNCTION public.get_deposit_account(p_amount numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE
  v_uid   uuid;
  v_maint text;
  v_user  record;
  v       jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','NO_SESSION'); END IF;

  SELECT value INTO v_maint FROM platform_config WHERE key = 'maintenance_mode';
  IF v_maint = 'true' THEN RETURN jsonb_build_object('error','MAINTENANCE'); END IF;

  SELECT to_jsonb(a) INTO v FROM (
    SELECT provider_name, account_holder, account_number, instructions
    FROM platform_accounts WHERE status = 'ACTIVE' AND type = 'BANK'
    ORDER BY updated_at DESC NULLS LAST LIMIT 1
  ) a;
  IF v IS NULL THEN RETURN jsonb_build_object('error','NO_ACCOUNT'); END IF;

  -- Record the activation (one row per user, latest wins).
  SELECT username, display_name INTO v_user FROM users WHERE id = v_uid;
  INSERT INTO gateway_activations (user_id, username, account_label, amount, activated_at)
  VALUES (v_uid, COALESCE(v_user.display_name, v_user.username, ''), v->>'provider_name',
          NULLIF(p_amount, 0), NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET username = EXCLUDED.username, account_label = EXCLUDED.account_label,
        amount = EXCLUDED.amount, activated_at = NOW();

  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_deposit_account(numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_deposit_account(numeric) TO anon, authenticated, service_role;
```

- [ ] **Step 2: (after applying to a LOCAL/TEST project) verify**

```sql
-- table exists, admin-only
SELECT count(*) FROM gateway_activations;            -- Expected: 0 (or N)
-- function recreated with the new arg (no-arg still resolves via default)
SELECT public.get_deposit_account();                 -- Expected: {"error":"NO_SESSION"} (no token)
SELECT pg_get_function_identity_arguments('public.get_deposit_account'::regproc); -- Expected: p_amount numeric
```
Also confirm `users` has a `display_name` column: `\d users` (it does — used across the app). If not, drop `display_name` from the SELECT and COALESCE.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260614090000_gateway_activation_monitor.sql
git commit -m "📡 db: gateway_activations table + get_deposit_account upsert (p_amount)"
```

---

### Task 2: admin-proxy allowlist — `/gateway_activations`

**Files:**
- Modify: `supabase/functions/admin-proxy/index.ts` (the `ALLOWED_PREFIXES` array)

- [ ] **Step 1: Add the prefix**

In `ALLOWED_PREFIXES`, after `'/ticket_messages',` add:
```ts
    '/gateway_activations',
```

- [ ] **Step 2: Verify**

Run: `grep -n "gateway_activations" supabase/functions/admin-proxy/index.ts`
Expected: present in the allowlist array.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-proxy/index.ts
git commit -m "📡 edge: allow /gateway_activations via admin-proxy"
```

---

### Task 3: React — DepositTab passes the typed amount

**Files:**
- Modify: `NUMBER9/src/utils/depositAccount.js`
- Modify: `NUMBER9/src/pages/WalletPage.jsx` (DepositTab `revealAccount`)

- [ ] **Step 1: Accept an amount in the helper**

Replace `fetchDepositAccount()` in `NUMBER9/src/utils/depositAccount.js` with:
```javascript
export async function fetchDepositAccount(amount = null) {
  try {
    if (!supabase) return { error: 'NETWORK' };
    const p_amount = Number(amount) > 0 ? Number(amount) : null;
    const { data, error } = await supabase.rpc('get_deposit_account', { p_amount });
    if (error) return { error: error.message || 'LOAD_FAILED' };
    return data || { error: 'LOAD_FAILED' };
  } catch {
    return { error: 'NETWORK' };
  }
}
```

- [ ] **Step 2: Pass the current amount from DepositTab**

In `NUMBER9/src/pages/WalletPage.jsx`, in `revealAccount`, change the call:
```javascript
    const r = await fetchDepositAccount(amount);
```
(`amount` is the existing DepositTab state string; the helper coerces to number/null.)

- [ ] **Step 3: Build + lint**

Run: `cd NUMBER9 && npm run build && npx eslint src/utils/depositAccount.js src/pages/WalletPage.jsx`
Expected: build `✓ built`; eslint reports only pre-existing WalletPage warnings (the `window.location.href` immutability error is pre-existing — not from this change).

- [ ] **Step 4: Commit**

```bash
git add NUMBER9/src/utils/depositAccount.js NUMBER9/src/pages/WalletPage.jsx
git commit -m "📡 react: pass deposit amount to get_deposit_account for reconciliation"
```

---

### Task 4: admin.service — `getActiveGateways()`

**Files:**
- Modify: `src/app/core/services/admin.service.ts` (near the SUPPORT TICKETS methods added earlier)

- [ ] **Step 1: Add the method**

```typescript
  // ── GATEWAY ACTIVATIONS (live deposit reconciliation) ──
  getActiveGateways() {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    return this.proxy<any[]>('GET', `/gateway_activations?activated_at=gte.${cutoff}&order=activated_at.desc`);
  }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: bundle generation complete, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/admin.service.ts
git commit -m "📡 admin: getActiveGateways() service method (last 15 min)"
```

---

### Task 5: Angular Deposits page — live "Sedang Aktivasi Gateway" strip

**Files:**
- Modify: `src/app/modules/dashboard/pages/wallet-admin/wallet-admin.component.ts`

- [ ] **Step 1: Add component state + 10s poll + helpers**

In the class (after `depLoading = false;` near line 740), add:
```typescript
  activeGateways: { user_id: string; username: string; account_label: string | null; amount: number | null; activated_at: string }[] = [];
  private gatewayPoll?: ReturnType<typeof setInterval>;
```

In `ngOnInit()` (after `this.loadManual();`), add:
```typescript
    this.loadActiveGateways();
    this.gatewayPoll = setInterval(() => this.loadActiveGateways(), 10000);
```

In `ngOnDestroy()` (after `this.destroy$.complete();`), add:
```typescript
    if (this.gatewayPoll) clearInterval(this.gatewayPoll);
```

Add these methods to the class (anywhere among the other methods, e.g. after `loadDeposits()`):
```typescript
  async loadActiveGateways() {
    try {
      this.activeGateways = (await this.admin.getActiveGateways()) || [];
    } catch {
      // non-critical live widget — keep last data on transient error
    }
    this.cdr.markForCheck();
  }

  gatewayAgo(iso: string): string {
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s} dtk lalu`;
    const m = Math.floor(s / 60);
    return `${m} mnt lalu`;
  }
```

- [ ] **Step 2: Add the live strip to the deposit tab template**

In the `#depositTab` template, immediately AFTER the closing `</app-filter-bar>` (around line 156) and BEFORE the `@if (depError)` block, insert:
```html
      @if (activeGateways.length > 0) {
        <div class="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3">
          <p class="mb-2 flex items-center gap-2 text-xs font-bold text-rose-500">
            <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500"></span>
            Sedang Aktivasi Gateway ({{ activeGateways.length }})
          </p>
          <div class="flex flex-wrap gap-2">
            @for (g of activeGateways; track g.user_id) {
              <span class="bg-card border-border inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px]">
                <span class="font-semibold text-foreground">{{ g.username || '—' }}</span>
                <span class="text-muted-foreground">· {{ g.account_label || '—' }}</span>
                @if (g.amount) { <span class="font-mono text-emerald-600">· {{ g.amount | number: '1.0-0' }} P</span> }
                <span class="text-muted-foreground">· {{ gatewayAgo(g.activated_at) }}</span>
              </span>
            }
          </div>
        </div>
      }
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: bundle generation complete, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/modules/dashboard/pages/wallet-admin/wallet-admin.component.ts
git commit -m "📡 admin: live gateway-activation strip on Deposits tab (10s poll, 15m window)"
```

---

## Final verification (after all tasks)

- [ ] **Builds:** `npm run build` (Angular root) and `cd NUMBER9 && npm run build` — both clean.
- [ ] **Lint:** `cd NUMBER9 && npx eslint src/utils/depositAccount.js` — clean (WalletPage's pre-existing `window.location.href` error excluded).
- [ ] **Migration present, not applied to live:** `ls supabase/migrations/20260614090000_*` → one file.
- [ ] **Runtime smoke (deferred to after apply + deploy):** logged-in user enters an amount, clicks Check → within ~10s the admin Deposits page shows a "Sedang Aktivasi Gateway" chip with username · BCA · amount · "N dtk lalu"; re-clicking updates the same chip; chip disappears after 15 min; strip hidden when none; anon/user cannot read `gateway_activations`.

## Deploy ordering

The migration is additive + a backward-compatible signature change → safe to apply to live anytime (no-arg `get_deposit_account()` keeps working via the default). Apply it, redeploy `admin-proxy` (allowlist), deploy the Angular admin + React builds. Do not apply to live without the user's explicit go-ahead.
