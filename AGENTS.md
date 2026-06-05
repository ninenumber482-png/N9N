# AGENTS.md

## Two apps, one monorepo

| App | Dir | Stack | Entrypoint | URL |
|-----|-----|-------|-----------|-----|
| **Admin** | `/` (root) | Angular 22, Tailwind 4, zoneless | `src/main.ts` (`bootstrapApplication`) | `localhost:4200` |
| **User** | `NUMBER9/` | React 19, Vite 8, Tailwind 4, Zustand | `NUMBER9/src/main.jsx` | `localhost:5175` |

Angular owns root `package.json`. React is nested under `NUMBER9/` with separate deps. They share no tooling config.

## Dev commands

```bash
# Admin Angular
npm start                          # dev → localhost:4200
npm test                           # Jasmine/Karma unit tests
npm run test:e2e                   # Playwright --ui (needs :4200 running)
npm run format                     # Prettier + Tailwind class ordering
npm run lint                       # Angular ESLint

# User React
cd NUMBER9 && npm run dev:user     # Vite → localhost:5175 (MUST use dev:user, not dev)
cd NUMBER9 && npm run build        # prod build (uses --mode user)
cd NUMBER9 && npm run lint         # React ESLint
```

**React env pitfall**: Reads `NUMBER9/.env.user` only with `--mode user`. Running plain `vite`/`npm run dev` silently falls back to broken localStorage.

## Build & deploy

- `npm run build` (Angular): runs `scripts/set-env.js` → `ng build` → copies `src/assets/_redirects` to output
- `cd NUMBER9 && npm run build` (React): `VITE_APP_MODE=user vite build --mode user`
- CI (`.github/workflows/deploy.yml`): runs `scripts/regression-test.sql` → builds both → deploys to Cloudflare Pages
  - `number9-admin` → `admin.mynumber9.uk`
  - `number9-app` → `app.mynumber9.uk`
- Local CI: `bash scripts/ci.sh` (same steps as CI workflow)

## Database

Supabase project `dqsmpdetiqsqfnidekik`, 88+ migrations in `supabase/migrations/`. Apply via Supabase SQL Editor or `supabase db push --linked`. Both apps call `SECURITY DEFINER` RPCs directly with the anon key (no RLS, RPCs enforce auth).

Key RPC signatures (never change without updating both callers):
- `settle_session(code, d1, d2, d3)` → `king_results` — atomic settlement
- `place_bet(session_code, selections[], stake, username)` — debit wallet, create bet
- `approve_deposit(txn_id, amount)` — credit balance
- `approve_withdrawal(txn_id)` — mark for transfer
- `submit_transaction(type, amount, method, proof_url)` — user submits deposit/withdrawal

## Session timing (critical: must match both apps)

Session codes: `N9K-YYYYMMDDHHMMSS`, one per 5-minute window.
Status lifecycle: NEXT → OPEN → LOCKED → RESULTING → SETTLED.

| Config location | Constant |
|----------------|----------|
| `src/app/modules/dashboard/pages/3dking/3dking.component.ts:6` | `SESSION_MS = 300_000` |
| `NUMBER9/src/store/king.js:69` | `SESSION_DURATION_MS = 300_000` |
| `NUMBER9/src/store/king.js:119` | `sessionAt()` function |

If these drift apart, results settle at wrong times.

## Angular zoneless quirk

`main.ts` uses `provideZonelessChangeDetection()`. Async callbacks (timers, subscriptions) **must** call `changeDetectionRef.markForCheck()` or the view won't update.

## State management

- **Angular**: `SupabaseService` + `RealtimeService` services + `markForCheck()` in async handlers
- **React**: Zustand stores in `NUMBER9/src/store/` (`king.js`, `wallet.js`, `useStore.js`)
- **Realtime fallback**: 4-second polling in GamePage

## Key files

| File | Purpose |
|------|---------|
| `src/app/modules/dashboard/pages/3dking/3dking.component.ts` | Draw engine, settlement logic |
| `NUMBER9/src/store/king.js` | Bet state, session calc, RPC wrappers |
| `NUMBER9/src/pages/GamePage.jsx` | Main betting UI with ArenaStage |
| `NUMBER9/src/pages/HistoryPage.jsx` | P&L (only SETTLED bets count) |
| `src/app/core/services/admin.service.ts` | Admin RPC wrappers |
| `supabase/migrations/20260601010000_king_engine.sql` | Core `settle_session` RPC |
| `supabase/migrations/20260602020000_deposit_withdrawal_rpcs.sql` | Deposit/withdrawal RPCs |
| `scripts/regression-test.sql` | CI regression check (12 tests) |
| `NUMBER9/.env.user` | Supabase creds (React, mode=user only) |

## Conventions

- Format: `npm run format` (root) runs Prettier on `src/**/*{.ts,.html,.css,.json}`
- Angular directives: `app` prefix, camelCase attribute / kebab-case element
- Commits: French with emojis
