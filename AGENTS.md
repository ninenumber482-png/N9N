# AGENTS.md

> Updated: 2026-06-07

## Two separate apps, one repo

| App | Dir | Stack | Entry | Dev URL |
|-----|-----|-------|-------|---------|
| **Admin** | `/` | Angular 22, zoneless, Tailwind 4, PrimeNG | `src/main.ts` | `:4200` |
| **User** | `NUMBER9/` | React 19, Vite 8, Tailwind 4, Zustand | `NUMBER9/src/main.jsx` | `:5175` |

Root `package.json` is Angular. React has its own deps under `NUMBER9/`. They share **no** tooling config.

## React env pitfall (agent trap)

`NUMBER9/.env.user` loads **only** with `--mode user`. Running plain `vite` / `npm run dev` silently gives broken localStorage. **Always use**:
```bash
cd NUMBER9 && npm run dev:user   # dev
cd NUMBER9 && npm run build      # prod (script includes --mode user)
cd NUMBER9 && npm run lint       # ESLint
```

## Angular zoneless quirk

`provideZonelessChangeDetection()` — async callbacks **must** call `changeDetectionRef.markForCheck()` or view won't update.

## Session timing (must match both apps)

`N9K-YYYYMMDDHHMMSS`, one per 5-min window. Status: NEXT → OPEN → LOCKED → RESULTING → SETTLED.

| Location | Constant |
|----------|----------|
| `src/app/…/3dking/3dking.component.ts:6` | `SESSION_MS = 300_000` |
| `NUMBER9/src/store/king.js:69` | `SESSION_DURATION_MS = 300_000` |

If they drift, results settle at wrong times.

## Database

Supabase `dqsmpdetiqsqfnidekik`, 88+ migrations in `supabase/migrations/`. Both apps call `SECURITY DEFINER` RPCs directly with anon key (no RLS — RPCs enforce auth). **Never change RPC signatures without updating both callers.**

## State & realtime

- Angular: `SupabaseService` + `RealtimeService` + `markForCheck()`
- React: Zustand slices (`authSlice`, `userSlice`, `balanceSlice`, `configSlice`), plus `king.js` and `wallet.js` modules
- GamePage falls back to 4-second polling if realtime fails

## Deploy

CI runs `scripts/ci.sh`: regression test SQL → build Angular → build React → deploy Edge Function → deploy both to Cloudflare Pages.

```bash
npm run build                     # Angular → dist/number9systemd/browser/
cd NUMBER9 && npm run build       # React → NUMBER9/dist/
```

- Admin → `admin.mynumber9.uk` (copies `_worker.js`, `_redirects`, `_headers`)
- User → `app.mynumber9.uk` (copies `_headers`)
- `_worker.js` at root: Cloudflare Pages gateway (cookie auth, rate limit, Turnstile, IP whitelist)

## Commits

French with emojis. Format: `npm run format` (Prettier + Tailwind class ordering).
