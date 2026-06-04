# HANDOFF — 2026-06-04 (post audit series)

> Read this + `CLAUDE.md` + `docs/AUDIT_UX_UI_2026-06-04.md` to resume work.

## Where we are
NUMBER9 platform is **feature-complete, stable, and built**. Two apps (Angular admin + React user) share one Supabase project. Just finished a comprehensive UX/UI audit + fix series.

## Just shipped (this session)
| SHA | Type | What |
|-----|------|------|
| `ed676f5` | feat(db) | Restore withdrawal atomic deduction + multi-tab token sync |
| `e30c2e2` | fix(ui) | Stabilize React pages (no routeLoading flash, no polling re-renders) |
| `2286cea` | chore | Remove dead code, debug files, unused assets (64 files) |
| `fb27ef0` | fix(ux) | 11 P0/P1/P2 audit findings (mobile nav, dead code, error recovery, i18n) |
| `9ac1a11` | chore(ux) | 11 polish items + React.lazy code-splitting (-41% bundle) |

**Audit status**: 22 of 35 findings fixed. Remaining 13 are low-value (see audit doc §"What's left").

## What's next (3 options)
- **A**: Deploy both builds to Cloudflare (`admin.mynumber9.uk` + `app.mynumber9.uk`)
- **B**: Manual smoke test of mobile nav (resize to 360px, click "More", verify all 10 pages reachable) + test new ProfilePage realtime sync (admin changes email/kyc, verify user sees it live)
- **C**: Finish remaining 13 audit items (mostly false positives + minor P3)

## Critical context
- **Supabase project ref**: `dqsmpdetiqsqfnfnidekik` (NOTE: was originally typed as `dqsmpdetiqsqfnidekik` — both refer to the same project, the `fnfn` form is the correct ref)
- **React dev**: `cd NUMBER9 && npm run dev:user` (port 5175, requires `--mode user` to read `.env.user`)
- **React build**: `cd NUMBER9 && npx vite build --mode user` (last: 593ms, 409 KB initial JS, 82 KB CSS)
- **Angular dev**: `npm start` (port 4200)
- **Angular build**: `npx ng build` (output: `dist/number9systemd/browser/`)
- **Supabase CLI**: at `~/.local/share/supabase/supabase-go`, set via `SUPABASE_GO_BINARY` env var
- **Realtime disabled** in `utils/supabase.js` (`realtimeEnabled=false`) due to Cloudflare error 1101 — polling fallback at 15s in `App.jsx`
- **Test users** (active, can login):
  - `bara25` — user_id `72b11908-c8fc-4061-aaa4-1d4b6819a982` (token rotates on every login)
  - `hmzzzz` — user_id `d1905c95-6d13-460a-a441-31410f5ab986`, balance_main 600, total_turnover 5300
- **Commits must be asked** — never auto-commit (per CLAUDE.md)
- **Per instructions** ("beri tanda agar claude dpt melanjutkan pekerjaan anda"):
  1. This file is the continuation sign
  2. Anchored summary is in the chat transcript (Claude Code restores it automatically)
  3. `docs/AUDIT_UX_UI_2026-06-04.md` is the source of truth for all 35 findings

## Key files
- `docs/AUDIT_UX_UI_2026-06-04.md` — 35-bug audit report (P0-P3, with file:line refs)
- `NUMBER9/src/App.jsx` — routes + lazy chunks + polling observer
- `NUMBER9/src/store/useStore.js` — auth, balances, `_userChangeHandlers` registry, `onUserChange` helper, auto-login IIFE with abort signal
- `NUMBER9/src/store/king.js` — 3D King engine client cache, `placeBid` bumps `_kingVersion`
- `NUMBER9/src/components/Layout.jsx` — bottom nav (5) + "More" tab opens ModalOverlay sheet
- `NUMBER9/src/components/ErrorBoundary.jsx` — has Reload + Back-to-Login buttons + dev error preview
- `NUMBER9/src/components/ui/Toast.jsx` — supports `ok` / `err` / `warn` (yellow) severities
- `supabase/migrations/20260604170000_restore_withdrawal_atomic_deduction.sql` — applied
- `supabase/migrations/20260604160000_per_deposit_turnover.sql` — created `deposit_locks` table
- `/tmp/opencode/test_rls.sh` — RLS test script (passes)
- `/tmp/opencode/cleanup_bara25.sql` — one-time test cleanup

## Quick commands
```bash
git log --oneline -5                                    # recent commits
cd NUMBER9 && npx vite build --mode user                # React build verify
npx ng build                                            # Angular build verify
SUPABASE_GO_BINARY=~/.local/share/supabase/supabase-go ~/.local/share/supabase/supabase-go db push --linked  # migrate
```

## What the next instance should do FIRST
1. Read `CLAUDE.md` (architecture overview)
2. Read `docs/AUDIT_UX_UI_2026-06-04.md` (remaining 13 items)
3. Ask user: deploy (A), smoke test (B), or finish audit (C)?
