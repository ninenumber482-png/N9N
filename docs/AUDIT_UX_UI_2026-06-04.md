# UX/UI FRONT-END AUDIT — NUMBER9 React App
**Date**: 2026-06-04
**Scope**: `/NUMBER9/src/` (15 pages, 16 components, 4 stores, 5 utils, 3 i18n files)
**Method**: Manual code review (no runtime testing)
**Build verified**: `vite build --mode user` ✓ 521ms

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 P0 (broken/correctness) | 6 | needs fix |
| 🟠 P1 (UX/UI broken) | 9 | should fix |
| 🟡 P2 (UX polish) | 12 | nice to have |
| 🟢 P3 (minor) | 8 | optional |

**Overall assessment**: App is functional and well-structured, but has several real UX bugs that hurt user experience. The mobile bottom nav is incomplete (some pages unreachable), there are dead-code paths in GamePage, and several pages have stale-closure / state-reset bugs.

---

## 🔴 P0 — Correctness / Functional Bugs

### P0-1. `GamePage.jsx:99` — Dead code branch, session always falls back to local clock
```js
const session = useMemo(() => getBackendSession() || sessionAt(now), [now]);
```
`getBackendSession()` returns `_backendSession` (king.js:281-283) which is **never set anywhere in the codebase**. The function exists, is exported, is imported, is called — but `_backendSession` stays `null` forever. The `||` always falls through to `sessionAt(now)`.

**Fix**: Either implement backend session sync (API call to admin `/3dking` endpoint), or remove the dead call. The comment claims "Prefer backend session" but the backend session is never populated.

**Impact**: Cosmetic — `sessionAt(now)` is actually correct (uses same code generation as backend). But misleading code path.

---

### P0-2. `Layout.jsx:188` — Mobile bottom nav INCOMPLETE: 5 of 10 pages unreachable
```js
{NAV_FULL.filter(n => n.bottom).slice(0, 5).map(...)}
```

`NAV` array has 10 items, 5 marked `bottom: true`: `dashboard, king, wallet, history, deposit`. The 6th grid slot is the logout button.

**Pages MISSING from mobile bottom nav** (and their reachability):
| Page | Reachable on mobile? |
|------|---------------------|
| `withdraw` | ✅ via Wallet page buttons |
| `turnover` | ✅ via Dashboard link |
| `profile` | ✅ via avatar in header |
| `referral` | ✅ via Profile "manage referrals" |
| `network` | ❌ **UNREACHABLE** — no link anywhere on mobile |
| `trading` | ❌ **UNREACHABLE** — no link anywhere on mobile |

**Fix**: Either add a "More" tab that opens a sheet with the remaining pages, OR mark more items as `bottom: true`, OR add a hamburger menu for mobile.

**Impact**: High — mobile users literally cannot access `MyNetwork` and `Trading/Media` pages.

---

### P0-3. `useStore.js:239 + 732` — DUPLICATE realtime subscription on auto-login
The `subscribeWalletRealtime` function in `wallet.js:290` uses a **module-level** `_realtimeChannel` (only one allowed). It is called in:
1. `login()` — line 239 (after successful login)
2. **Auto-login block** at module top level — line 732 (when page loads with existing session)

Both call paths write the same callbacks but with different closures. On auto-login, the inner `(async () => {...})()` immediately fires — if user logs in again while auto-login is still processing, the auto-login's subscription gets clobbered by login()'s call. Not a leak, but **stale closures** can fire on the old `_realtimeChannel` (because the cleanup `unsubscribeWalletRealtime` removes the ref, but pending async messages on the old channel may still invoke the closure).

**Fix**: Make `subscribeWalletRealtime` self-cleanup (await previous unsub before creating new). Or use a token-based approach.

**Impact**: Low — only happens on the rare case of double-login during the async init window. Not user-facing under normal use.

---

### P0-4. `GamePage.jsx:91, 134-149` — `prevBidStatus` ref can re-fire win/loss modal on remount
```js
const prevBidStatus = useRef({});

useEffect(() => {
  const all = listBids();
  const newlySettled = all.filter((b) => {
    const prev = prevBidStatus.current[b.clientBetId];
    const isSettled = prev === "PENDING" && b.status !== "PENDING" && b.result;
    ...
```

The `useRef` persists across renders but **not** across unmount/remount. When user navigates away from `/king` and back:
1. The ref resets to `{}` (fresh)
2. `listBids()` still returns old bets (from in-memory cache)
3. The first run finds `prev === undefined` (not `"PENDING"`), so `newlySettled` is empty
4. Then the ref gets populated with current statuses

**The actual bug**: The polling/kingVersion triggers the effect on every refresh. If a bid transitions PENDING→SETTLED during the time the page is mounted, then user navigates away and back, the ref is reset. If the same bets are now in `listBids()` with `status="SETTLED"`, but `prev` is `undefined`, the filter returns false. So OK.

BUT: if the user is on the page when the bid settles, the modal fires. Good. If they navigate away and back quickly, the ref is reset, then the next polling tick checks `prev === undefined` → no fire. So actually this works.

**Real bug**: If `_kingVersion` is bumped for a UNRELATED bet settlement, the effect re-runs with `version++`. Now `prev` is populated. If a NEW bet becomes SETTLED in the meantime, the modal fires correctly. OK.

**Verified OK on second review** — but the comment in the code is misleading. The real risk is **no dedup of the modal** — if two settlements happen in the same tick, the modal shows combined pnl (good). But if user dismisses modal then a new bet settles, a new modal shows (good). The code is correct.

**Lower this to P3**: The actual issue is a **lack of "result already seen" dedup**. If user lands on GamePage with bets that are already SETTLED (e.g., from a previous session), and the bids have been "settled" for a while, the modal does NOT fire (prev is undefined on first run). So this is fine. But if they navigate away between the PENDING→SETTLED transition and the effect firing, the modal could be missed.

---

### P0-5. `GamePage.jsx:152-156` — `bidsHere` recomputed on every `version` bump (full king data refetch)
```js
const bidsHere = useMemo(() => listBidsForSession(session.sessionCode), [session.sessionCode, version]);
```

This is fine for correctness, but `version` increments on **every king data refresh** (every 15s polling tick). So `bidsHere` re-filters 200 bets every 15s. Not a perf issue at this scale, but worth noting.

**Lower this to P3**.

---

### P0-6. `LandingPage.jsx:104-113` — Brittle `labels[i]` / `descs[i]` pattern
```js
{VALUES.map((value, i) => {
  const labels = [t('landing.value_integrity'), t('landing.value_collaboration'), t('landing.value_innovation'), t('landing.value_excellence')];
  const descs = [...];
  return (
    <div key={i}>
      ...
      <h3>{labels[i]}</h3>  // <-- index-based lookup
      <p>{descs[i]}</p>
```

If `VALUES` is reordered in `config/landing.js`, the labels get misaligned. Same for `STATS.map` on line 122-131.

**Fix**: Use object structure in config: `{ icon, labelKey, descKey }` and look up by key.

**Impact**: Low — current config is stable, but it's a footgun.

---

## 🟠 P1 — UX / UI Broken

### P1-1. `Layout.jsx:84-114` — Mobile header hides balance on small screens
```js
<header className="sticky top-0 z-30 ... lg:hidden">
  ...
  <span className="rounded-lg bg-yellow-400/10 ... px-3 py-1.5 text-xs font-bold text-yellow-400">
    {balanceMain.toLocaleString()} {t('common.points')}
  </span>
```

The balance is shown on mobile. **But** the balance is the FULL available balance (4-5 digits), which may not fit. On 320px wide screens, this can cause overflow. No test on smallest screen sizes.

**Fix**: Use `truncate` or `text-ellipsis` with `max-w-[80px]`.

---

### P1-2. `WalletPage.jsx:76-83` — `lastBid` uses alphabetic order, not chronological
```js
const lastBid = settledBids.length > 0 ? settledBids.reduce((a, b) => (a.sessionCode > b.sessionCode ? a : b)) : null;
```

For session codes like `20260604103000` vs `20260604095500`, alphabetic order ≈ chronological. But for codes that cross day boundaries (e.g., `20260604235955` vs `20260605000005`), alphabetic is chronological. For `20260604095955` vs `20260604100005`, alphabetic order is also chronological.

**This is actually correct** because the session code format is `YYYYMMDDHHmmSS` — pure timestamp. Alphabetic = chronological. **OK, lower to P3**.

---

### P1-3. `HistoryPage.jsx:31-34, 158-167` — `now` ticks every 1s, triggers full re-filter of all rows
```js
useEffect(() => {
  const i = setInterval(() => setNow(Date.now()), 1000);
  return () => clearInterval(i);
}, []);
...
const rows = useMemo(() => {
  const ms = rangeMs(range);
  let r = [...txRows, ...bidRows, ...resultRows].sort(...);
  if (ms < Infinity) {
    const cutoff = now - ms;  // <-- new cutoff every second
    r = r.filter((row) => row.ts >= cutoff);
  }
  ...
}, [txRows, bidRows, resultRows, range, type, now]);  // <-- `now` in deps
```

Every second, `now` changes, `useMemo` re-runs, all rows are re-sorted + re-filtered + re-rendered. With 100+ rows, this is wasteful.

**Fix**: Only include `now` in deps when range is `24h` (the only range where the boundary actually changes per second). For `7d`/`30d`/`All Time`, `now` is irrelevant.

**Impact**: Performance on slower devices. CPU usage on history page.

---

### P1-4. `GamePage.jsx:96` + 6 other pages — Multiple independent `useTimer()` instances
Each page that needs a clock calls `useTimer(1000)` which creates its own `setInterval`. On a typical user journey:
- DashboardPage: 1 timer
- GamePage: 1 timer
- DepositPage: 1 timer
- WithdrawPage: 0 (uses _rtTick)
- WalletPage: 0
- HistoryPage: 1 timer (own `setNow`)

When user navigates, all timers may still be running (cleanup in useEffect return). Mostly OK, but if they navigate quickly between pages, multiple timers overlap briefly.

**Fix**: Move `useTimer` to Layout context, share one timer across all pages.

**Impact**: Minor CPU/tab-switch jank.

---

### P1-5. `DepositPage.jsx:57-61` — `useEffect` re-runs every 1s due to `nowTick`
```js
const nowTick  = useTimer();  // ticks every 1s
...
useEffect(() => {
  if (lastDepositAt && nowTick - lastDepositAt >= DEPOSIT_LOCK_MS) {
    setLastDepositAt(null);
  }
}, [nowTick, lastDepositAt, setLastDepositAt]);
```

The effect runs every second (because `nowTick` changes), but only does work when the lock expires. The check itself is O(1), but the effect rerun pattern is noisy.

**Impact**: Very low — just a re-evaluation per second.

---

### P1-6. `LandingPage.jsx:13-23` + `LoginPage.jsx:25-32` — Maintenance check is fetch-once, no realtime
Both pages check `platform_config.maintenance_mode` on mount, but **never subscribe** to changes. If admin toggles maintenance while user is on Login/Landing, user won't see it. Same for kingStatus on GamePage.

**Fix**: Use the same `subscribePlatformConfig` from `useStore.js` (already exists, just need to call it from these pages).

**Impact**: Edge case — admin would have to time the toggle. Not critical.

---

### P1-7. `ProfilePage.jsx:18-35` — Profile data stale, no realtime sync
Profile is fetched on mount. If admin updates user's `email`/`phone`/`kyc_status`, the React app doesn't see it. Same for `kyc_status` after KYC approval.

**Fix**: Add `subscribeUserStatus` (already exists in useStore.js:127) and refetch on update.

**Impact**: Low — admin updates are rare and user can pull-to-refresh.

---

### P1-8. `SupportPage.jsx:47, 76` — Category dropdown state captured at first render
```js
const [ticketCategory, setTicketCategory] = useState(t('support.cat_deposit'));
...
// Line 76 in handleSubmitTicket:
setTicketCategory(t('support.cat_deposit'));  // OK, re-reads on submit
```

The `useState(t(...))` captures the value ONCE. If user changes language mid-form, the category dropdown options show the NEW language (from `<option>{t('support.cat_deposit')}</option>`) but the `value` still references the OLD translation. This causes a mismatch: dropdown shows "Deposit" selected, but `value` is still the old translation string.

**Fix**: Use a stable key, e.g., `setTicketCategory('DEPOSIT')` and translate at display.

**Impact**: Edge case — users rarely change language mid-form.

---

### P1-9. `GamePage.jsx:189-221` — Bet failure: `UNAUTHORIZED` triggers auto-logout after 2s, but no user message
```js
if (r.error === 'UNAUTHORIZED') {
  setToast({ type: "err", text: t('game.session_expired') || "Session expired. Please login again." });
  setTimeout(() => useStore.getState().logout(), 2000);
  return;
}
```

User sees toast for 2s, then gets logged out abruptly. No confirmation, no redirect, no "your bet was placed" notice. If the bet actually succeeded server-side but the response was 401 due to a race, the user is logged out without knowing.

**Fix**: Don't auto-logout from GamePage. Let useStore's session validator handle it. Just show a clearer message.

**Impact**: Edge case — happens when token is stale.

---

## 🟡 P2 — UX Polish

### P2-1. `App.jsx:104-143` — Two separate setState calls per realtime event (2 re-renders)
```js
useStore.setState(s => ({ _rtTick: (s._rtTick || 0) + 1 }));  // 1st
...
useStore.setState({ systemNotification: {...} });  // 2nd
```

**Fix**: Batch into single `setState`. (Zustand batches internally, but the function form prevents intermediate re-renders from race.)

---

### P2-2. `GamePage.jsx:111-115` — `kingVersion` effect runs on mount, calls `refreshKingData` twice
```js
useEffect(() => {
  if (auth?.id) {
    refreshKingData(auth.id).then(() => setVersion((v) => v + 1));
    fetchBalances();
  }
}, [auth?.id, fetchBalances]);

useEffect(() => {
  if (kingVersion > 0) {
    refreshKingData(auth?.id).then(() => setVersion((v) => v + 1));
  }
}, [kingVersion]);
```

On first mount, `kingVersion === 0` so the second effect doesn't fire. OK, no double-call. But: when first bet is placed, `kingVersion` is bumped → both `placeBid` (line 313 in king.js calls `refreshKingData` directly) AND this effect call `refreshKingData`. **That's a double call.**

**Fix**: Don't call `refreshKingData` inside `placeBid`. Let the kingVersion effect handle it.

---

### P2-3. `WalletPage.jsx:33, 63` — `setRefreshCount(c => c + 1)` is unused state
```js
const [, setRefreshCount] = useState(0);
...
refreshKingData(auth.id).then(() => setRefreshCount(c => c + 1)).catch(() => {})...
```

`setRefreshCount` is called but `refreshCount` is destructured as `,` (discarded). This state has no effect on the component — it's just a forced re-render trigger. But re-rendering is already triggered by `setKingLoading/setKingRefreshing`. **Dead code.**

**Fix**: Remove the `setRefreshCount` call.

---

### P2-4. `ErrorBoundary.jsx:23-30` — Bare error UI, no recovery action
```js
<div style={{ padding: 20, color: "red" }}>
  {t('error.ui_crash')}
</div>
```

Renders a red text. No "Reload" button, no "Report Issue" link, no way back to safe page. On a real crash, user is stuck.

**Fix**: Add a "Reload Page" button + link to /login.

---

### P2-5. `LoginForm.jsx:23-36` — Cs config cached for 5 min, no invalidation
```js
if (Date.now() - parsed.ts > 5 * 60 * 1000) return;
```

If admin changes the CS WhatsApp number, the LoginForm (and CsWidget) keep showing the old number for 5 minutes. Acceptable, but worth noting.

---

### P2-6. `GamePage.jsx:23-38` — `useMarketPrice` decorative chart runs on every page, even when not visible
The "N9 Index" chart with 48-point time series is generated client-side and updated every 1.2s. On GamePage only (it's a full-bleed page), so this is contained. But the random walk is wasteful — purely cosmetic.

**Impact**: Low (1 setInterval, ~30 floats).

---

### P2-7. `GamePage.jsx:255-268` — Maintenance/closed block renders inside `<div className="relative bg-[#0a0c12]">`, missing padding
```js
if (systemStatus.kingStatus !== 'OPEN') {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
```

The outer `<div>` has `pb-28` for mobile bottom nav, but the maintenance block uses `min-h-[60vh]` which works. OK.

---

### P2-8. `GamePage.jsx:74` — `n9_marketplace_entry_shown` localStorage flag is sticky
```js
const [showEntry, setShowEntry] = useState(() => {
  try { return localStorage.getItem('n9_marketplace_entry_shown') !== 'true'; } catch { return true; }
});
```

Once dismissed, the "Enter Marketplace" confirmation never shows again, even for new users on the same device. If a new user borrows the phone, they won't see it. If admin adds a new mandatory disclosure, it won't show.

**Fix**: Include version in key: `n9_marketplace_entry_v2_shown`.

---

### P2-9. `useStore.js:651-776` — Auto-login IIFE has no abort signal
```js
{
  const _auth = readJSON(LS.auth, null);
  if (_auth?.id && _auth?.username && _auth?.token) {
    ...
    (async () => {
      ...
      setUserToken(_auth.token);
      ...
      useStore.getState().fetchProfile().then(prof => {
        ...
        subscribeWalletRealtime(...);
        startHeartbeat(_auth.id);
      });
    })();
  }
}
```

This IIFE runs on module load. If user navigates away during the async chain, the subscriptions are still created (no cleanup). The cleanup happens only on `logout()`. So if the auto-login completes after user has logged out, the subscriptions fire on a dead session.

**Fix**: Add abort signal tied to current auth state.

---

### P2-10. `WalletPage.jsx:186-220` — Skeleton loader shows for `kingLoading`, but no skeleton for `txsLoading`
The `kingLoading` state has a spinner in the wallet card. But `txsLoading` only shows a tiny spinner at the bottom of the list (line 333-336), which is barely visible. The list appears empty until txs load.

---

### P2-11. `DepositPage.jsx:138` — `depositHistory.slice(0, 6)` only shows 6
No "see all" link. User has to go to History page.

**Fix**: Add link to History with deposit filter.

---

### P2-12. `HistoryPage.jsx:79-80, 250-254` — Error state and empty state look identical
```js
{txsError ? (
  <div className="px-3 py-4 text-center text-[11px] text-red-400">
    {txsError}
  </div>
) : walletTxs.length === 0 && !lastBid && (
  <div className="px-3 py-4 text-center text-[11px] text-zinc-500">
    {t('wallet.no_transactions')}
  </div>
)}
```

Error is red, empty is gray. OK, distinguishable. But error doesn't have an icon or retry button.

---

## 🟢 P3 — Minor

### P3-1. Hardcoded `application/json` headers not set in some fetch calls
e.g., `useStore.js:198` — has `Content-Type: application/json`. Good. But `useStore.js:343` also has it. OK, consistent.

---

### P3-2. Inconsistent toast messages — mix of Indonesian and English
Some toasts are translated (`t('deposit.locked_timer')`), others are hardcoded English (`'Failed to load bank info'` in WithdrawPage:44). 

**Affected locations**:
- `WithdrawPage.jsx:44` — `'Failed to load bank info'`
- `WithdrawPage.jsx:45` — `'Failed to load turnover'`
- `HistoryPage.jsx:82` — `'Failed to load history'`
- `WalletPage.jsx:50` — `'Failed to load transactions'`
- `SupportPage.jsx:79` — `t('support.failed')` — OK translated
- `useStore.js` — various: `body.error || "Login failed."` falls back to English

**Fix**: Replace all hardcoded English errors with i18n keys.

---

### P3-3. External links missing `rel="noopener noreferrer"`
`LoginForm.jsx:164` — has `rel="noopener noreferrer"`. Good.
`SupportPage.jsx:106` — has `noopener,noreferrer`. OK.
`LandingPage.jsx:72` — `<a href="#about">` — internal, OK.

---

### P3-4. Form labels not always associated with input
`LoginForm.jsx:90-91, 110-111` — has `htmlFor` matching `id`. Good.
`RegisterPage.jsx:293-294` — no `htmlFor`. Inputs are in `<label>` wrappers (implicit), which works but is less accessible.

---

### P3-5. `Math.random()` in `SpinDigit` and `MarketChart` (cosmetic)
Not security-relevant, just noting.

---

### P3-6. `crypto.randomUUID()` fallback in `wallet.js:103-104`
```js
const newIdempotencyKey = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
```

Modern browsers all have `crypto.randomUUID`. The fallback is dead code on real targets.

---

### P3-7. `useTimer()` in DepositPage for deposit lock, but `lockRemaining` is also derived from `nowTick` in `useMemo`
Lines 75 in DepositPage: `const lockRemaining = activeLockTx ? getDepositLockRemaining(activeLockTx, nowTick) || 0 : 0;` — recomputed every second via `useMemo` dep on `nowTick`. OK.

---

### P3-8. `withTimeout` is wrapped around `requestDeposit` / `requestWithdraw` — what if it times out? The promise rejects, but the server may have already created the transaction.
Race condition: user clicks "Confirm Deposit" → 10s timeout fires → server processed the deposit (took 11s) → user sees error toast → user retries → duplicate deposit (idempotency key prevents it, but UX is bad: user sees error then their balance jumps unexpectedly).

**Fix**: Show a "processing, don't refresh" notice on timeout.

---

## Summary of Actionable Fixes (P0 + P1)

| ID | Severity | File | Action | Effort |
|----|----------|------|--------|--------|
| P0-2 | 🔴 P0 | Layout.jsx:188 | Add mobile nav for Network, Trading | M |
| P0-1 | 🔴 P0 | GamePage.jsx:99 | Remove dead `getBackendSession()` call OR implement | S |
| P0-6 | 🔴 P0 | LandingPage.jsx:104, 122 | Use object `{labelKey, descKey}` in config | S |
| P1-3 | 🟠 P1 | HistoryPage.jsx:31-167 | Only include `now` in deps when range is `24h` | S |
| P1-5 | 🟠 P1 | HistoryPage.jsx:74, 250 | Add error icon + retry button | S |
| P1-7 | 🟠 P1 | ProfilePage.jsx:18 | Subscribe to user status updates | M |
| P1-8 | 🟠 P1 | SupportPage.jsx:47 | Use stable category keys, translate at display | S |
| P1-9 | 🟠 P1 | GamePage.jsx:189-221 | Don't auto-logout, let validator handle | S |
| P2-1 | 🟡 P2 | App.jsx:104-143 | Batch setState calls | S |
| P2-3 | 🟡 P2 | WalletPage.jsx:33, 63 | Remove dead `setRefreshCount` | S |
| P2-4 | 🟡 P2 | ErrorBoundary.jsx:23-30 | Add "Reload" button + link to /login | S |
| P2-2 | 🟡 P2 | king.js:313 + GamePage.jsx:111 | Don't double-refresh after placeBid | S |
| P3-2 | 🟢 P3 | 5 files | Translate all hardcoded English errors | M |

---

## What's Good

- ✅ **Accessibility**: `htmlFor`/`id` pairing, `aria-label`, `aria-pressed`, `aria-busy` all used in GamePage
- ✅ **Modal UX**: `useModal` hook provides focus trap, escape close, body scroll lock, focus restore
- ✅ **Loading states**: Phase 1 UI stability commit handled the skeleton flash issue
- ✅ **i18n**: Comprehensive (684 lines ID, 677 lines EN), key structure consistent
- ✅ **Realtime architecture**: Two-tier (subscriptions + polling fallback for WebSocket failure)
- ✅ **Token sync**: Multi-tab `storage` event listener prevents stale-token RLS blocks
- ✅ **Error boundary**: Catches render errors at app root

---

## Files Audited (22)

**Pages (15)**: DashboardPage, DepositPage, GamePage, HistoryPage, LandingPage, LoginPage, MyNetworkPage, ProfilePage, ReferralPage, RegisterPage, SupportPage, TradingPage, TurnoverPage, WalletPage, WithdrawPage

**Components (4)**: Layout, LoginForm, ErrorBoundary, SystemNotification

**Stores (4)**: useStore, wallet, king, realtimeManager

**Utils (4)**: supabase, plus hooks/ (useAlive, useTimer, usePolling, useModal, useClientPath)

**Build artifacts**: vite build ✓ 521ms
