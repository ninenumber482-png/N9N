# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Repository Overview

**NUMBER9 Platform** — A dual-app betting/gaming system with admin dashboard:
- **Angular App** (Admin + 3D King Engine): `/src` — Angular 22, zoneless, Tailwind 4, PrimeNG
- **React App** (User Betting): `/NUMBER9` — React 19, Vite 8, Zustand, Tailwind 4
- **Shared Backend**: Supabase PostgreSQL + SECURITY DEFINER RPCs + `pg_cron` settlement engine
- **EC2 Python Bot**: `bot_monitor.py` — backup settlement + Telegram monitoring

Both apps share one Supabase project: `dqsmpdetiqsqfnidekik` (env vars in `.env.user` and Angular `src/environments/`).

---

## Key Commands

### Angular App (Admin Dashboard)
```bash
npm start                 # Dev server at http://localhost:4200
npm run build             # Production build → dist/number9systemd/browser/
npm run watch             # Build + watch mode
npm run test              # Run unit tests (Jasmine/Karma)
npm run test:e2e          # E2E tests with Playwright (--ui for visual)
npm run lint              # ESLint check
npm run format            # Prettier + Tailwind class ordering
```

### React App (User Betting)
```bash
cd NUMBER9
npm run dev:user          # Dev server at http://localhost:5175 (Vite, mode=user)
npm run build             # Production build → dist/ (uses VITE_APP_MODE=user)
npm run lint              # ESLint check
```

### Database & Migrations
```bash
# Supabase migrations are in: supabase/migrations/*.sql
# Apply manually via Supabase dashboard SQL Editor OR:
supabase db push --linked  # If Supabase CLI linked

# Key migrations (in order):
# - 20260601010000_king_engine.sql (creates king_results, king_planned, settle_session RPC)
# - 20260602020000_deposit_withdrawal_rpcs.sql (place_bet, approve_deposit, approve_withdrawal)
```

### CI Pipeline
```bash
bash scripts/ci.sh   # regression SQL → build Angular → build React → deploy Edge Functions → deploy Cloudflare Pages
```

### Commits
French with emojis. Format before committing: `npm run format` (Prettier + Tailwind class ordering).

### Deployment
```bash
npm run build                    # Angular → dist/number9systemd/browser/
cd NUMBER9 && npm run build      # React → NUMBER9/dist/
cd NUMBER9 && npm run deploy     # React build + wrangler pages deploy

# Angular → https://admin.mynumber9.uk (Cloudflare Pages)
# React   → https://app.mynumber9.uk  (Cloudflare Pages)
# Gateway → _worker.js (Cloudflare Pages Worker: cookie auth, rate limit, Turnstile, IP whitelist)
```

---

## Architecture

### App Structure: Two Connected SPAs

```
NUMBER9 PLATFORM (Monorepo)
│
├─ ANGULAR APP (Admin)
│  ├─ src/app/core/              # Services, guards, interceptors
│  │  ├─ services/
│  │  │  ├─ admin.service.ts     # All Supabase RPC wrappers (single source of truth)
│  │  │  ├─ auth.service.ts      # Session, bcrypt login
│  │  │  ├─ realtime.service.ts  # Supabase realtime subscriptions + BehaviorSubjects
│  │  │  └─ notification.service.ts  # Toast wrapper
│  │  └─ constants/menu.ts       # Sidebar menu groups + icon/route config
│  ├─ src/app/modules/
│  │  ├─ auth/pages/sign-in/     # Login page (IP whitelist check + bcrypt)
│  │  ├─ dashboard/
│  │  │  ├─ dashboard.component.ts   # Shell: prev/next nav, global realtime init
│  │  │  ├─ dashboard-routing.module.ts
│  │  │  └─ pages/               # One folder per admin page (inline templates, no .html)
│  │  └─ layout/                 # Sidebar, navbar, bottom-nav components
│  ├─ src/shared/pipes/wib-date.pipe.ts  # Asia/Jakarta date formatting
│  └─ dist/number9systemd/browser/       # Build output
│
├─ REACT APP (User Betting)
│  ├─ NUMBER9/src/
│  │  ├─ pages/
│  │  │  ├─ GamePage.jsx         # Main betting UI + ArenaStage result display
│  │  │  ├─ HistoryPage.jsx      # Transaction history + P&L (only SETTLED bets count)
│  │  │  ├─ DashboardPage.jsx    # Wallet, turnover, stats
│  │  │  ├─ WalletPage.jsx       # Deposit/Withdrawal tabs
│  │  │  ├─ ProfilePage.jsx      # KYC, password change
│  │  │  ├─ ReferralPage.jsx / MyNetworkPage.jsx  # Referral system
│  │  │  ├─ SupportPage.jsx      # Support tickets
│  │  │  ├─ TradingPage.jsx      # Trading history
│  │  │  ├─ LandingPage.jsx / LoginPage.jsx / RegisterPage.jsx  # Auth flow
│  │  ├─ store/
│  │  │  ├─ king.js              # 3D King engine state, session calc, result display
│  │  │  ├─ wallet.js            # Wallet/transaction functions
│  │  │  ├─ useStore.js          # Zustand root store (composes all slices)
│  │  │  │  └─ slices/              # authSlice, userSlice, balanceSlice, configSlice
│  │  ├─ utils/supabase.js       # Supabase client (15s timeout, x-user-token injection)
│  │  └─ i18n/                   # en.js + id.js translations
│  └─ dist/                      # Build output
│
└─ SUPABASE BACKEND
   ├─ Tables
   │  ├─ users (kyc_status, account_status, registration_status, login_status)
   │  ├─ wallet (balance_main, balance_bonus, total_turnover)
   │  ├─ bets (user_id, session_code, selection, stake, status, result, actual_payout)
   │  ├─ transactions (type: DEPOSIT/WITHDRAWAL, status, amount, proof_url)
   │  ├─ king_results (session_code PK, d1-d3, total, big_small, odd_even)
   │  ├─ king_planned (session_code PK, d1-d3 — engine-generated + admin-overrideable)
   │  ├─ support_tickets (user_id, subject, message, status)
   │  └─ audit_log, user_audit_log, security_alerts, failed_login_attempts, platform_config, popup_banners, ip_whitelist
   │
   ├─ RPC Functions (SECURITY DEFINER — bypass RLS, callable by anon key)
   │  ├─ settle_session(code, d1, d2, d3)   — Atomic: publish draw, settle bets, credit winners
   │  ├─ place_bet(session_code, selections[], stake, username)
   │  ├─ approve_deposit(txn_id, amount)    — Admin approve, credit balance
   │  ├─ approve_withdrawal(txn_id)         — Admin approve, mark for transfer
   │  └─ submit_transaction(type, amount, method, proof_url)
   │
   ├─ pg_cron — PRIMARY settlement engine (calls settle_session every 5 min automatically)
   │  Backup: bot_monitor.py on EC2 (Python/Flask + Telegram bot) runs same logic
   │
   └─ Edge Functions (supabase/functions/)
      auth-login, auth-logout, auth-validate   — Admin cookie-based auth (7-day session)
      user-login, user-register                — User JWT auth flow
      upload-proof, upload-file                — Storage uploads
      generate-referral                        — Referral code generation
      admin-proxy                              — Deployed in CI; routes admin API calls
```

### Angular Admin Page Routing

`dashboard-routing.module.ts` maps routes to components. Key subtlety:
- **`/wallet`, `/deposits`, `/withdrawals`** — all three routes load `WalletAdminComponent`, which auto-selects the correct tab from `ActivatedRoute`. Do not create separate components for deposit/withdrawal pages.
- **`/member-balance`** — redirects to `/wallets` (legacy alias).
- **`/system`** and **`/role-management`** — protected by `RoleGuard` (`admin` and `superadmin` roles respectively).
- `deposits.component.ts` exists in the codebase but **is not used by any route** — it is dead code; do not reference it.

The bottom **Prev/Next navigation** in `dashboard.component.ts` (`PAGE_ORDER` array) must stay in sync with `src/app/core/constants/menu.ts`. Every routable page should appear in both; omitting a page from `PAGE_ORDER` breaks its pagination links.

### Session Code Internals

Two representations — they must not be confused:

| Format | Example | Used where |
|--------|---------|------------|
| Internal UTC raw digits | `202606022010` | DB keys (`king_results.session_code`, `king_planned.session_code`, `bets.session_code`) |
| Display code (N9K- + WIB) | `N9K-202606022010` | Shown to users in React app, status headers |

The `3dking.component.ts` `fmtCode()` generates the raw UTC code. `displayCode()` converts to the N9K-WIB display form. The `sessionDisplay()` in `bets.component.ts` applies the same conversion. **The DB always stores the raw UTC digits without the N9K- prefix.**

Session timing: `SESSION_MS = 300_000` (5 min), `LOCK_MS = 60_000` (betting closes 1 min before draw). These constants exist in both Angular (`3dking.component.ts:6`) and React (`king.js:69`) and **must stay identical**.

Session lifecycle state machine: **NEXT → OPEN → LOCKED → RESULTING → SETTLED**. State transitions are driven by the countdown timer in both apps. If they drift, results settle at the wrong time.

---

## Angular Admin Panel Patterns

All dashboard page components share these conventions — follow them when adding pages:

1. **Inline templates** — all pages use `template: \`...\`` inside the `@Component` decorator. There are no separate `.html` files in `pages/`.
2. **Zoneless + OnPush** — Angular uses `provideZonelessChangeDetection()`. Use `ChangeDetectionStrategy.OnPush` on every component. **Always** call `this.cdr.markForCheck()` after any async operation, timer callback, or subscription update — without this the view will not update.
3. **`inject()`** — use Angular's `inject()` function instead of constructor injection.
4. **PrimeNG** for interactive controls: `p-select`, `p-tag`, `p-paginator`, `p-dialog`, `p-confirmdialog`, `p-datepicker`, `p-inputNumber`. All destructive actions must use `p-confirmdialog`.
5. **`WibDatePipe`** (`| wibDate: 'short'`) for all date display. Do not use the Angular `date` pipe directly for timestamps (wrong timezone).
6. **Pagination pattern**: use PrimeNG `p-paginator` with `(onPageChange)` emitting `{ first, rows }`. Compute `currentPage` as `Math.floor(first / rows) + 1`.
7. **Page header icon** — wrap in `<div class="page-header-icon">`. Table cards use `class="bg-card border-border rounded-lg page-accent-card"`.
8. **Realtime**: subscribe in `ngOnInit`, unsubscribe via `takeUntil(destroy$)` in `ngOnDestroy`.

---

## Critical Integration Points

### Pending Logic
- **Bet**: PENDING = stake debited, result pending. SETTLED = WIN/LOSE assigned. Only SETTLED bets count toward P&L.
- **Transaction**: PENDING = awaiting admin approval. COMPLETED = balance updated.

### Admin Actions (all via RPC — no direct SQL)
- Approve user → auto-approves all PENDING KYC docs + unlocks login (`users.component.ts`)
- Approve deposit → `approve_deposit` RPC instantly credits `wallet.balance_main`
- Approve withdrawal → `approve_withdrawal` RPC debits balance, marks for bank transfer

### Realtime Architecture
- Angular: `RealtimeService` holds Supabase channel subscriptions and exposes BehaviorSubjects (`transactions$`, `users$`, `bets$`, `kyc$`, `wallets$`). `DashboardComponent` (`ngOnInit`) starts 4 global subscriptions that persist across page navigation. Individual pages subscribe to the same subjects for silent background refresh.
- React: `GamePage.jsx` subscribes to Supabase realtime for live session updates. If realtime fails, it falls back to a 4-second polling interval automatically.

---

## Environment & Secrets

### Angular App
- No runtime secrets in source; Supabase URL/key in `src/environments/environment.ts`
- `src/environments/` defines build targets (dev, prod)

### React App
- **Critical**: `.env.user` must exist with Supabase credentials; loaded only via `--mode user`
- Without `--mode user`, app fails silently in production (falls back to localStorage)
- Build: `VITE_PORT=5175 VITE_APP_MODE=user vite build --mode user` (already in `package.json`)

### Supabase
- Project ID: `dqsmpdetiqsqfnidekik`
- RLS is off; auth enforced by SECURITY DEFINER RPC functions only
- Admin credentials: bcrypt hash stored in `users` table; verified in `auth-login` Edge Function; session stored in `n9_session` cookie (7 days)
- `_worker.js` at root: Cloudflare Pages Worker gateway (cookie auth, rate limit, Turnstile CAPTCHA, IP whitelist) — deployed alongside Angular to `admin.mynumber9.uk`

---

## Known Issues & Workarounds

| Issue | Cause | Fix |
|-------|-------|-----|
| Build fails: "Vite env undefined" | React built without `--mode user` | Always use `npm run build` in `/NUMBER9`, not bare `vite build` |
| Results not showing in React | `king_results` table missing | Run `20260601010000_king_engine.sql` in Supabase SQL Editor |
| View doesn't update after async | OnPush + setInterval/subscription callback | Always call `cdr.markForCheck()` after state change |
| Pending bets counted as losses | Old HistoryPage code | Fixed: only SETTLED bets count toward P&L (king.js lines 92-93) |

---

## Debugging a Failed Bet Settlement

1. React → HistoryPage → confirm bet status shows SETTLED (not PENDING)
2. Supabase → `king_results` table → verify session_code row exists with correct d1/d2/d3
3. Supabase → `bets` table → filter by session_code, all bets should be SETTLED
4. Supabase → `wallet` table → winners' `balance_main` updated
5. Angular 3D King page → check `inflight` set isn't stuck (page refresh clears it)
6. Supabase logs → RPC errors from `settle_session`

---

## Deployment Checklist

- [ ] Migration applied in Supabase (tables/functions exist)
- [ ] Both apps build without errors
- [ ] Session timing constants match: `SESSION_MS`/`LOCK_MS` in Angular and `king.js`
- [ ] `PAGE_ORDER` in `dashboard.component.ts` covers all menu routes in `menu.ts`
- [ ] Realtime subscriptions verified (open admin + user app side-by-side, trigger an action)
- [ ] Build outputs: `dist/number9systemd/browser/` (Angular) + `NUMBER9/dist/` (React)

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/modules/dashboard/pages/3dking/3dking.component.ts` | Draw engine: session lifecycle, settlement, category override |
| `src/app/modules/dashboard/dashboard-routing.module.ts` | All admin page routes — source of truth for what routes exist |
| `src/app/core/constants/menu.ts` | Sidebar menu config — must stay in sync with routing + PAGE_ORDER |
| `src/app/core/services/admin.service.ts` | Every Supabase query/RPC used by the admin app |
| `src/app/core/services/realtime.service.ts` | Supabase realtime channels + BehaviorSubjects |
| `NUMBER9/src/store/king.js` | React betting engine: session boundary calc, bet state, result display |
| `NUMBER9/src/pages/GamePage.jsx` | Main betting UI + ArenaStage result animation |
| `supabase/migrations/20260601010000_king_engine.sql` | Core settlement logic |
| `bot_monitor.py` | EC2 Python bot: backup settlement + Telegram monitoring |
| `_worker.js` | Cloudflare Pages Worker gateway (admin app auth layer) |

---

## Note for Future Instances

**Two user flows, one backend:**
1. **Angular admin**: approves users/KYC/deposits/withdrawals, operates the 3D King draw engine
2. **React user**: registers, bets, submits deposits/withdrawals, views history

**Never modify RPC signatures** without updating callers in both apps. The session timing constants and the session code format (raw UTC digits in DB, N9K-WIB display to users) are shared contracts between the two apps.
