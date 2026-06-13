# Gateway Activation Monitor (Live Deposit Reconciliation)

- **Date:** 2026-06-14
- **Status:** Design approved — pending spec review
- **Scope:** Supabase (1 table + extend `get_deposit_account`), admin-proxy allowlist, React DepositTab (pass amount), Angular Deposits admin page (live strip).
- **Related:** Builds directly on the deposit gated-reveal (`get_deposit_account()`, applied to live 2026-06-14). See `docs/superpowers/specs/2026-06-14-deposit-account-gated-reveal-design.md` and memory `cs_chat_deposit_reveal_live_state`.

---

## 1. Background & Problem

A user deposits by clicking **"Check / Load System"**, which reveals the destination BCA account, then transfers and uploads proof. Today the admin only learns of a deposit when the proof is submitted — there is no awareness of who is *currently* about to transfer. That makes matching an incoming bank transfer (which arrives by name + amount, before/without proof) to the right user slow and manual.

This feature gives the admin a **near-real-time (within ~10s) live list of users who just activated the gateway** (clicked Check), with the account and intended amount, so incoming BCA transfers can be reconciled to the right user quickly.

Confirmed with the user:
- **Purpose:** live monitor + reconciliation (not fraud-detection or audit-only).
- **Placement:** a live strip on the **Deposits admin page**, above the pending-deposit table.
- **Window:** activations from the last **15 minutes** count as "currently activating."
- **Capture the amount** (key reconciliation field: match by name + amount).

## 2. Goals

- When a logged-in user activates the gateway (Check → account revealed), record `user_id, username, account_label, amount, activated_at`.
- Admin sees a live strip on the Deposits page listing currently-activating users (last 15 min), refreshing every ~10s, with "X seconds/minutes ago" and the amount when known.
- No user-facing exposure; admin-only via the service_role proxy.

## 3. Non-Goals (YAGNI)

- No fraud scoring / alerts (that's the separate Security-Center concern).
- No automatic linking of activation → settled deposit (admin correlates visually against the pending table directly below). Possible v2.
- No history/analytics of activations — one row per user (latest), not an event log.

## 4. Capture — extend `get_deposit_account()`

`get_deposit_account()` already fires exactly on gateway activation. Extend it:

- New optional param `p_amount numeric DEFAULT NULL`.
- On a **successful reveal only** (an ACTIVE bank account is found), **upsert** one row into `gateway_activations` keyed by `user_id` (latest activation per user).
- The existing no-arg call must be dropped first to avoid an ambiguous overload:

```sql
DROP FUNCTION IF EXISTS public.get_deposit_account();

CREATE OR REPLACE FUNCTION public.get_deposit_account(p_amount numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE v_uid uuid; v_maint text; v_user record; v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','NO_SESSION'); END IF;
  SELECT value INTO v_maint FROM platform_config WHERE key = 'maintenance_mode';
  IF v_maint = 'true' THEN RETURN jsonb_build_object('error','MAINTENANCE'); END IF;

  SELECT to_jsonb(a) INTO v FROM (
    SELECT provider_name, account_holder, account_number, instructions
    FROM platform_accounts WHERE status='ACTIVE' AND type='BANK'
    ORDER BY updated_at DESC NULLS LAST LIMIT 1
  ) a;
  IF v IS NULL THEN RETURN jsonb_build_object('error','NO_ACCOUNT'); END IF;

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

## 5. Table `gateway_activations`

```sql
CREATE TABLE IF NOT EXISTS public.gateway_activations (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username      text NOT NULL DEFAULT '',
  account_label text,
  amount        numeric,
  activated_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gateway_activations_at ON public.gateway_activations(activated_at DESC);
REVOKE ALL ON public.gateway_activations FROM anon, authenticated;  -- admin/service_role only
```

One row per user (upsert) → table stays tiny (bounded by distinct depositing users); no cron prune needed — the 15-min window filter hides stale rows.

## 6. Admin read

Via the existing `admin-proxy` (service_role) — add `/gateway_activations` to `ALLOWED_PREFIXES`:
```
GET /gateway_activations?activated_at=gte.<ISO now-15min>&order=activated_at.desc
```
Angular computes the cutoff: `new Date(Date.now() - 15*60*1000).toISOString()`.

New `admin.service` method:
```typescript
getActiveGateways() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  return this.proxy<any[]>('GET', `/gateway_activations?activated_at=gte.${cutoff}&order=activated_at.desc`);
}
```

## 7. Admin UI — live strip on the Deposits tab

In `WalletAdminComponent` (deposit tab), **above** the pending-deposit table:
- A card "🔴 **Sedang Aktivasi Gateway (N)**" listing each row: `username · account_label · amount (formatted, or "—") · "X dtk/mnt lalu"`.
- Polls `getActiveGateways()` every **10s** (setInterval in ngOnInit, cleared in ngOnDestroy; OnPush → `cdr.markForCheck()`).
- **Auto-hides** when the list is empty.
- "time ago" computed client-side from `activated_at`.

## 8. Frontend — pass the amount

`NUMBER9/src/utils/depositAccount.js` → `fetchDepositAccount(amount)` passes `{ p_amount: Number(amount) || null }`. `WalletPage.jsx` DepositTab `revealAccount` passes the current `amount` field. (Amount may be empty if the user clicks Check before typing it — then `null`; they can re-click after entering it to update.)

## 9. Migration & apply

Single additive migration `20260614090000_gateway_activation_monitor.sql`: create `gateway_activations` + grants + DROP old `get_deposit_account()` + CREATE new `get_deposit_account(numeric)`. **Additive/safe** — apply to live like the other additive ones; the new function is backward-compatible (no-arg calls still work via the default). Add `/gateway_activations` to `admin-proxy` allowlist (ships with the admin-proxy redeploy).

## 10. Security

- `gateway_activations` has **no anon/authenticated access** — admin reads via service_role proxy only.
- The write path is the SECURITY DEFINER `get_deposit_account` (already login-gated); a user can only ever upsert their **own** row (`user_id = get_user_id()`).
- No account numbers stored in `gateway_activations` (only a label like "Bank Central Asia") — no new sensitive-data exposure.

## 11. Testing

- Logged-in user clicks Check (with/without amount) → a row appears in the admin strip within one 10s poll, showing username + BCA + amount (or "—").
- Re-clicking Check updates the same row (latest time/amount), not a duplicate.
- Row drops off the strip after 15 min.
- Strip hidden when no recent activations.
- Anon/user cannot read `gateway_activations` (REST blocked); only admin-proxy returns it.
- No-arg `get_deposit_account()` still works (backward compatibility).
- Mobile + desktop admin layout.
