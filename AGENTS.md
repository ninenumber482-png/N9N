# AGENTS.md

## Two apps, one monorepo

| App | Dir | Stack | Entrypoint | URL |
|-----|-----|-------|-----------|-----|
| **Admin** | `/` (root) | Angular 22, Tailwind 4, zoneless | `src/main.ts` (`bootstrapApplication`) | `localhost:4200` |
| **User** | `NUMBER9/` | React 19, Vite 8, Tailwind 4, Zustand | `NUMBER9/src/main.jsx` | `localhost:5175` |

Angular is the legacy build output + root `package.json`. React is nested under `NUMBER9/`. They share no tooling config (separate ESLint, separate deps).

## Dev commands

```bash
# Admin Angular
npm start                          # dev → localhost:4200
npm test                           # Jasmine/Karma unit tests
npm run test:e2e                   # Playwright (3 browsers, needs :4200 running)
npm run format                     # Prettier + Tailwind class ordering
npm run lint                       # Angular ESLint

# User React
cd NUMBER9 && npm run dev:user     # Vite → localhost:5175 (MUST use dev:user, not dev)
cd NUMBER9 && npm run build        # prod build
cd NUMBER9 && npm run lint         # React ESLint
```

**React env pitfall**: React reads env from `NUMBER9/.env.user` only when `--mode user` is passed. Running plain `vite` or `npm run dev` inside NUMBER9 will silently fall back to `localStorage` (broken). Always use `npm run dev:user` or `npm run build`.

## Build & deploy pipeline

```
npm run build                      # Angular → dist/number9systemd/browser/
cd NUMBER9 && npm run build        # React → NUMBER9/dist/

# CI (.github/workflows/deploy.yml): both builds → Cloudflare Pages
# Angular project: number9-admin   → admin.mynumber9.uk
# React project:   number9-app     → app.mynumber9.uk
```

CI also runs `supabase db query --file scripts/regression-test.sql` before deploying. CI deploys both apps on every push to `main`/`master`.

## Database

Supabase project `dqsmpdetiqsqfnidekik`, 78+ migrations in `supabase/migrations/`. Apply via Supabase dashboard SQL Editor or `supabase db push --linked`. Both apps call `SECURITY DEFINER` RPCs directly with the anon key (no RLS, RPCs enforce auth).

Key RPC signatures (never change without updating both callers):
- `settle_session(code, d1, d2, d3)` — atomic settlement
- `place_bet(session_code, selections[], stake, username)` — debit wallet, create bet
- `approve_deposit(txn_id, amount)` — credit balance
- `approve_withdrawal(txn_id)` — mark for transfer
- `submit_transaction(type, amount, method, proof_url)` — user submits deposit/withdrawal

## Session timing (critical: must match both apps)

Session codes: `N9K-YYYYMMDDHHMMSS`, one per 5-minute window.
Status lifecycle: NEXT → OPEN → LOCKED → RESULTING → SETTLED.

| Config location | What to change |
|----------------|----------------|
| `NUMBER9/src/store/king.js:20-30` | `sessionAt()` function |
| `src/app/modules/dashboard/pages/3dking/3dking.component.ts` | `SESSION_DURATION_MS` constant |

If these drift apart, results settle at wrong times.

## State management

- **Angular**: services (`SupabaseService`, `RealtimeService`) + zoneless (must call `changeDetectionRef.markForCheck()` in async callbacks)
- **React**: Zustand stores in `NUMBER9/src/store/` (`king.js`, `wallet.js`, `useStore.js`)
- **Realtime fallback**: silent 4-second polling interval in GamePage

## Key files

| File | Purpose |
|------|---------|
| `src/app/modules/dashboard/pages/3dking/3dking.component.ts` | Draw engine, settlement logic |
| `NUMBER9/src/store/king.js` | Bet state, session calc, RPC wrappers |
| `NUMBER9/src/pages/GamePage.jsx` | Main betting UI with ArenaStage |
| `NUMBER9/src/pages/HistoryPage.jsx` | P&L calculation (only SETTLED bets count) |
| `src/app/modules/dashboard/services/admin.service.ts` | Admin RPC wrappers |
| `supabase/migrations/20260601010000_king_engine.sql` | Core `settle_session` function |
| `supabase/migrations/20260602020000_deposit_withdrawal_rpcs.sql` | Deposit/withdrawal RPCs |
| `scripts/regression-test.sql` | CI regression check |
| `NUMBER9/.env.user` | Supabase creds (mode=user only) |

## Conventions

- Format: `npm run format` (root) runs Prettier on `src/**/*{.ts,.html,.css,.json}`
- Angular directives: `app` prefix, camelCase attribute / kebab-case element
- Commit style: French with emojis
- No `opencode.json` config present
- `CLAUDE.md` exists at root (legacy, more verbose)
