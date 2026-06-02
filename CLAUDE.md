# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Repository Overview

**NUMBER9 Platform** — A dual-app betting/gaming system with admin dashboard:
- **Angular App** (Admin + 3D King Engine): `/src` — Admin dashboard, user approval, settlement engine
- **React App** (User Betting): `/NUMBER9` — User registration, betting, wallet, history
- **Shared Backend**: Supabase PostgreSQL + RPC functions

Both apps share one Supabase project: `dqsmpdetiqsqfnidekik` (environment variables in `.env.user` and local config).

---

## Key Commands

### Angular App (Admin Dashboard)
```bash
npm start                 # Dev server at http://localhost:4200
npm run build             # Production build → dist/number9systemd/browser/
npm run watch             # Build + watch mode
npm run test              # Run unit tests (Jasmine/Karma)
npm run test:e2e          # E2E tests with Playwright (--ui for visual)
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
# - Other schema/trigger migrations
```

### Deployment
```bash
# Build both apps
npm run build            # Angular → dist/number9systemd/browser/
cd NUMBER9 && npm run build  # React → dist/

# Deploy to Cloudflare Pages (manual via dashboard or via CLI)
# Angular → https://admin.mynumber9.uk
# React → https://app.mynumber9.uk
```

---

## Architecture

### App Structure: Two Connected SPAs

```
NUMBER9 PLATFORM (Monorepo)
│
├─ ANGULAR APP (Admin)
│  ├─ src/app/core/              # Services, guards, auth
│  ├─ src/app/modules/
│  │  ├─ auth/                   # Login/logout (AuthService)
│  │  ├─ dashboard/
│  │  │  ├─ pages/
│  │  │  │  ├─ 3dking/          # Draw engine (settle_session, override category)
│  │  │  │  ├─ users/           # User approval (syncs kyc_status)
│  │  │  │  ├─ deposits/        # Deposit approval (calls approve_deposit RPC)
│  │  │  │  ├─ withdrawals/     # Withdrawal approval
│  │  │  │  ├─ kyc/             # KYC document review
│  │  │  │  └─ wallets/         # Balance tracking (realtime)
│  │  │  └─ services/
│  │  │     └─ admin.service.ts # RPC wrappers (approve_user, settle_session, etc)
│  │  └─ layout/
│  ├─ src/assets/                # Images, icons, styles
│  └─ dist/number9systemd/browser/ (build output)
│
├─ REACT APP (User Betting)
│  ├─ NUMBER9/src/
│  │  ├─ pages/
│  │  │  ├─ GamePage.jsx        # Main betting interface (place_bet, realtime results)
│  │  │  ├─ HistoryPage.jsx     # Transaction history (bets, deposits, withdrawals)
│  │  │  ├─ DashboardPage.jsx   # Wallet, turnover, stats
│  │  │  ├─ DepositPage.jsx     # Deposit submission (calls submit_transaction RPC)
│  │  │  ├─ WithdrawPage.jsx    # Withdrawal submission
│  │  │  └─ ProfilePage.jsx     # User profile, KYC status
│  │  ├─ store/
│  │  │  ├─ king.js             # 3D King engine state (bets, results, sessions)
│  │  │  ├─ wallet.js           # Wallet/transaction functions (approve_deposit RPC)
│  │  │  └─ useStore.js         # Zustand auth + balance state
│  │  ├─ i18n/                  # English & Indonesian translations (id.js, en.js)
│  │  ├─ components/ui/         # Buttons, inputs, modals, dialogs
│  │  └─ utils/                 # Helpers (date formatting, async, etc)
│  └─ dist/                      (build output)
│
└─ SUPABASE BACKEND
   ├─ Tables
   │  ├─ users (kyc_status, account_status, registration_status)
   │  ├─ wallet (balance_main, total_turnover)
   │  ├─ bets (user_id, session_code, selection, stake, status, result, actual_payout)
   │  ├─ transactions (type: DEPOSIT/WITHDRAW, status, amount, proof_url)
   │  ├─ king_results (session_code PK, d1-d3, total, big_small, odd_even)
   │  ├─ king_planned (session_code PK, d1-d3 — admin-set upcoming draws)
   │  └─ Other: audit_log, referral, support_tickets, etc.
   │
   └─ RPC Functions (SECURITY DEFINER — bypass RLS, callable by anon key)
      ├─ settle_session(code, d1, d2, d3) — Atomic settlement: publish draw, settle bets, credit winners
      ├─ place_bet(session_code, selections[], stake, username) — Place bet, debit wallet
      ├─ approve_deposit(txn_id, amount) — Admin approve, credit balance
      ├─ approve_withdrawal(txn_id) — Admin approve, mark for transfer
      ├─ submit_transaction(type, amount, method, proof_url) — User submit deposit/withdrawal
      └─ Other: incremental settlement, referral tracking, etc.
```

### Session & Result Flow

**Session Format**: `N9K-YYYYMMDDHHMMSS` (e.g., `N9K-202606022010`)
- One session per 5-minute window
- Status lifecycle: NEXT → OPEN → LOCKED (1 min before) → RESULTING → SETTLED

**Result Generation** (Angular 3DKing component):
1. Engine checks `king_planned` table every 100ms
2. If session lacks result, generates random digits (0-9 each) → upserts `king_planned`
3. At settlement time, calls `settle_session(code, d1, d2, d3)` RPC:
   - Reads `king_planned` for authoritative result (admin can override category)
   - Inserts into `king_results` (idempotent via session_code PK)
   - Updates all PENDING bets for this session (WIN/LOSE + payout)
   - Credits winners' `wallet.balance_main` in atomic transaction

**Result Display** (React GamePage):
- ArenaStage component shows: NEXT session state → OPEN (live market) → RESULTING (spinning animation) → SETTLED (result digits)
- HistoryPage fetches results from React `store/king.js` which reads from `king_results` table

---

## Critical Integration Points

### Pending Logic (No Ambiguity)
- **Bet Status**: PENDING = awaiting session result (stake temp-debited, P&L not calculated)
- **Bet Status**: SETTLED = result published (WIN/LOSE, actual P&L shown)
- **Transaction Status**: PENDING = awaiting admin approval; COMPLETED = settled (balance updated)
- **HistoryPage** filters correctly: only SETTLED bets count toward net P&L (line 92-93 in king.js)

### Admin Automation (No Manual SQL)
- User approval → auto-approves KYC + unlocks login (Angular users.component.ts)
- Deposit approval → instantly credits balance (approve_deposit RPC)
- Withdrawal approval → debit validated, mark for bank transfer
- All via button click; zero SQL required (implemented in admin.service.ts)

### Realtime Subscriptions (Angular)
- Dashboard components subscribe to wallet, bets, transactions tables
- Changes appear instantly in UI (RealtimeService + SupabaseService)
- Fallback: silent auto-refresh on 4-second interval (GamePage line 105-111)

---

## Environment & Secrets

### Angular App
- No env secrets needed in code; configuration in `angular.json`
- `src/environments/` defines build targets (dev, prod, etc)

### React App
- **Critical**: `.env.user` contains Supabase credentials for user app
- Vite loads only via `--mode user` flag (see package.json scripts)
- Without `--mode user`, app falls back to localStorage (broken in production)
- Build command: `VITE_PORT=5175 VITE_APP_MODE=user vite build --mode user`

### Supabase
- Project ID: `dqsmpdetiqsqfnidekik`
- Both apps use anon key (RLS off; SECURITY DEFINER RPCs enforce auth)
- Admin login via bcrypt in auth-login Edge Function (optional, currently hardcoded in users table)

---

## Common Development Workflows

### Adding a New Feature
1. **Database first**: Create migration in `supabase/migrations/` (date-prefixed)
2. **Angular admin**: Add component in `src/app/modules/dashboard/pages/` if admin-facing
3. **React user**: Add page in `NUMBER9/src/pages/` or component in `NUMBER9/src/components/`
4. **Test in dev**: `npm start` (Angular) + `npm run dev:user` (React) simultaneously
5. **Realtime verification**: Open admin dashboard + user app side-by-side, trigger action, verify sync

### Debugging a Failed Bet Settlement
1. Check React GamePage → HistoryPage → verify bet status is SETTLED
2. Check Supabase → `king_results` table → verify session_code exists with correct digits
3. Check Supabase → `bets` table → filter by session_code, verify all bets updated to SETTLED
4. Check Supabase → `wallet` table → verify balance updated for winners
5. Check logs: `supabase logs` for RPC errors, React console for frontend errors

### Modifying Session Length (Default: 5 min)
- **React**: `king.js` lines 20-30 (session boundary calc from sessionAt function)
- **Angular**: `3dking.component.ts` (SESSION_DURATION_MS constant)
- Both must match; if mismatch, results may settle at wrong time

---

## Known Issues & Workarounds

### Issue: Build fails with "Vite env undefined"
**Cause**: React app built without `--mode user` flag
**Fix**: Always use `npm run build` (not direct `vite build`); script includes `--mode user`

### Issue: Results not showing in React app
**Cause**: `king_results` table doesn't exist (migration not applied)
**Fix**: Execute 20260601010000_king_engine.sql in Supabase SQL Editor

### Issue: Angular zoneless app doesn't update view
**Cause**: Async state changes in timer/subscription callbacks not triggering detection
**Fix**: Call `changeDetectionRef.markForCheck()` after state update (see GamePage line 105)

### Issue: Pending bets mixed with LOSE/WIN in P&L calculation
**Cause**: Old code counted PENDING as loss
**Fix**: HistoryPage.jsx lines 92-93 now only counts WIN/LOSE bets

---

## Deployment Checklist

Before pushing to production:
- [ ] Database migration executed in Supabase (check tables/functions exist)
- [ ] Both apps build without errors (`npm run build` + `cd NUMBER9 && npm run build`)
- [ ] Pending logic is clear (no ambiguous states)
- [ ] Session codes are correctly formatted (N9K-YYYYMMDDHHMMSS)
- [ ] Results display in React app (ArenaStage component)
- [ ] Admin can approve users/deposits/withdrawals without SQL
- [ ] Realtime subscriptions working (open two browsers, verify sync)
- [ ] Build outputs ready for Cloudflare: `dist/number9systemd/browser/` (Angular) + `NUMBER9/dist/` (React)

---

## Key Files to Understand First

| File | Purpose |
|------|---------|
| `src/app/modules/dashboard/pages/3dking/3dking.component.ts` | Draw engine logic, settle_session calls |
| `NUMBER9/src/store/king.js` | Bet state, session calc, RPC wrappers |
| `NUMBER9/src/pages/GamePage.jsx` | Main betting UI, ArenaStage (result display) |
| `NUMBER9/src/pages/HistoryPage.jsx` | Transaction history, P&L calculation |
| `src/app/modules/dashboard/services/admin.service.ts` | RPC wrappers (approve, settle, etc) |
| `supabase/migrations/20260601010000_king_engine.sql` | Core settlement logic (settle_session function) |
| `supabase/migrations/20260602020000_deposit_withdrawal_rpcs.sql` | Deposit/withdrawal approval logic |

---

## Note for Future Instances

This codebase has **two distinct user flows**:
1. **Angular admin**: Approve users, settle draws, manage deposits/withdrawals
2. **React user**: Register, place bets, submit deposits/withdrawals, view history

Both are **tightly coupled to Supabase RPC functions**. Never modify RPC signatures without updating callers in both apps. Use caution with session timing logic (must be identical in Angular + React) and P&L calculation (only SETTLED bets count).

