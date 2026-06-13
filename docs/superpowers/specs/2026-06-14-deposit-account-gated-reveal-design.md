# Deposit Account — Gated Reveal (Anti-Bocor)

- **Date:** 2026-06-14
- **Status:** Design approved — pending spec review
- **Scope:** NUMBER9 React user app (DepositTab) + one additive Supabase RPC
- **Related:** Continues the security work in commit `eef9a34` (CS widget login-only + bank account hidden from frontend). See migrations `20260614020000_cs_contact_auth_rpc.sql` and `20260614030000_revoke_anon_platform_accounts.sql`.

---

## 1. Background & Problem

In the prior task we removed the platform bank-account display from the deposit page entirely (generic instruction only) and revoked anon `SELECT` on `platform_accounts`. That closed the leak but left the deposit page without any way for a user to learn where to transfer money.

This feature restores the destination account to the user — but **only after an explicit action and only for a logged-in session**, so the account number is never present on initial page load, never reachable by anonymous callers, and never written to browser storage.

The chosen purpose (confirmed with the user) is **"gate reveal (anti-bocor)"**: the reveal is a security gate, not a per-deposit assignment and not an eligibility/anti-fraud gate.

## 2. Goals

- Logged-in user can reveal the **single active destination bank account** (bank type, holder name, account number) by clicking a **"Check / Load System"** button.
- The account number is never in the initial HTML, never served to anon, never persisted to `localStorage`/`sessionStorage`.
- Reuse the existing `platform_accounts` table and its admin tooling — no new table, no new admin UI.
- Consistent with the `get_cs_contact()` login-gated RPC pattern already shipped.

## 3. Non-Goals (YAGNI)

- No per-user / per-deposit account assignment or rotation.
- No unique transfer code / amount-suffix reconciliation. Admin reconciles via uploaded proof + amount, unchanged.
- No one-time signed reveal tokens or server-side expiry.
- No change to the deposit submission flow (`submit-deposit-wrapper`) or its parameters.

## 4. Architecture & Data Flow

```
DepositTab (React, logged-in only)
  │  instruction card (existing)  +  "Check / Load System" button
  │
  ├─ click ─▶ state: "verifying…" (spinner, ~600ms minimum for feel)
  │            │
  │            └─▶ supabase.rpc('get_deposit_account')   (x-user-token auto-injected)
  │                   │
  │                   ├─ {error:'NO_SESSION'}  → "Sesi habis, login ulang"
  │                   ├─ {error:'MAINTENANCE'} → "Sistem sedang pemeliharaan"
  │                   ├─ {error:'NO_ACCOUNT'}  → "Belum ada rekening tujuan, hubungi CS"
  │                   └─ {provider_name, account_holder, account_number, instructions}
  │                          → render Account Card (with copy-to-clipboard)
  │
  └─ nominal input + proof upload + submit  (unchanged)
```

Account data is held in **component state only**. On unmount / leaving the tab / re-entering, it is gone and the user must click again (fresh fetch). Nothing is cached to storage.

## 5. Backend — `get_deposit_account()` RPC

New migration file (e.g. `20260614040000_deposit_account_rpc.sql`). **Additive only** — creates a function, alters nothing existing.

Behavior (mirrors `get_cs_contact` / `get_my_*` token pattern):

```sql
CREATE OR REPLACE FUNCTION public.get_deposit_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid uuid;
  v_maint text;
  v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'NO_SESSION');
  END IF;

  SELECT value INTO v_maint FROM platform_config WHERE key = 'maintenance_mode';
  IF v_maint = 'true' THEN
    RETURN jsonb_build_object('error', 'MAINTENANCE');
  END IF;

  SELECT to_jsonb(a) INTO v FROM (
    SELECT provider_name, account_holder, account_number, instructions
    FROM platform_accounts
    WHERE status = 'ACTIVE' AND type = 'BANK'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  ) a;

  IF v IS NULL THEN
    RETURN jsonb_build_object('error', 'NO_ACCOUNT');
  END IF;

  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_deposit_account() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_deposit_account() TO anon, authenticated, service_role;
```

- `get_user_id()` resolves `x-user-token` → user UUID (existing helper). Without a valid session it returns `NULL` → `NO_SESSION`. This is the real login gate.
- **Maintenance guard** = the "mastiin tidak ada yang janggal" check: don't hand out an account while the platform is in maintenance.
- Selection is **deterministic** even if more than one bank row is `ACTIVE` (most-recently-updated wins). Admin convention: keep exactly one ACTIVE bank account.
- `GRANT ... TO anon` makes the RPC *callable*, but it returns `NO_SESSION` to anyone without a valid token — anon never receives account data.
- `platform_accounts` remains anon-`SELECT`-revoked (from migration `...030000`). This RPC is the **only** user-facing path to the data, login-gated.

## 6. Frontend — DepositTab Changes (React)

- Replace nothing in the existing instruction card; **add** the reveal control beneath it.
- Local state: `revealing` (bool), `account` (object|null), `revealError` (string|null).
- **Button** "Check / Load System":
  - Disabled when the deposit form is already blocked (`formBlocked` — existing pending-deposit or 15-min lock state), since revealing an account they can't use yet is pointless.
  - On click: set `revealing`, call `fetchDepositAccount()`, enforce a ~600ms minimum spinner, then set `account` or `revealError`.
- **Account card** (shown only when `account` set): jenis bank (`provider_name`), nama pemilik (`account_holder`), nomor rekening (`account_number`, mono, with a copy-to-clipboard button + "Tersalin" feedback), and `instructions` note if present.
- New helper `utils/depositAccount.js` → `fetchDepositAccount()` calling `supabase.rpc('get_deposit_account')`, returning `{account}` or `{error}`; **no caching to storage** (memory only, like `csContact` but without even the module-level cache, since this is sensitive and per-explicit-action).
- i18n keys (en + id): button label, verifying, error messages (NO_SESSION/MAINTENANCE/NO_ACCOUNT), card field labels, copy/copied.
- Clear any in-memory account on logout (already covered by component unmount on route change; logout also tears down the app shell).

## 7. Security Guarantees

| Surface | Guarantee |
|---|---|
| Initial HTML / page load | No account data present |
| Anonymous caller (no token) | RPC returns `NO_SESSION`; table SELECT still revoked |
| Direct REST `from('platform_accounts')` | Blocked for anon/authenticated (migration `...030000`) |
| Browser storage | Account never written to localStorage/sessionStorage |
| Maintenance window | RPC returns `MAINTENANCE`, no account handed out |
| Only reveal surface | Authenticated `get_deposit_account` response, after explicit click |

## 8. Admin

No new admin UI. Admin sets/edits the destination bank account through the existing `platform_accounts` management (wallets admin page), marking exactly one bank row `ACTIVE`. Admin access is via admin-proxy (service_role) and is unaffected by the anon revoke.

## 9. Deploy Ordering

The new `get_deposit_account` RPC is **purely additive** → safe to apply to live at any time, and should be applied **before or together with** the frontend deploy so the reveal works immediately. (Unlike the prior anon-revoke, which must trail its frontend deploy.) Per the standing constraint, the migration is **written but NOT applied to live by the implementer** — the user reviews and applies it.

## 10. Testing Checklist

- Anonymous (not logged in): button/page exposes no account; calling the RPC without a token returns `NO_SESSION`; nothing in HTML.
- Logged-in: click → "verifying…" → correct bank/holder/number revealed; copy-to-clipboard works.
- Maintenance mode ON: reveal blocked with the maintenance message.
- No ACTIVE bank account configured: friendly "contact CS" message, no crash.
- DevTools/Network: account appears only in the post-click RPC response — never on load; confirm absent from localStorage/sessionStorage.
- Form-blocked state (pending deposit / 15-min lock): reveal button disabled.
- Logout: revealed account no longer visible.
- Mobile + desktop layouts.

## 11. Constraints

- Migration written but **not applied to live** by the implementer.
- No changes to existing RPC signatures or the deposit submission flow.
- Follow existing zoneless/React patterns; reuse `get_user_id()` and the `get_cs_contact()` RPC style.
