---
name: run-number9
description: Run, build, screenshot, and smoke-test the NUMBER9 platform — Angular admin app and React user betting app. Use for deploy, verify, debug, or screenshot tasks.
---

# NUMBER9 Platform — Run Skill

Two SPAs sharing one Supabase backend. Driven locally via `chromium --headless` + `smoke.sh`. For deploy verification, driven via `curl` against the Supabase Edge Functions.

- **Angular Admin** (local): `http://localhost:4200` or `:4201` (dev server)
- **React User** (local): `http://localhost:5178/#/login` (port varies — see Gotchas)
- **Angular Admin** (prod): `https://admin.mynumber9.uk` (Cloudflare Pages, project `number9-admin`)
- **React User** (prod): `https://app.mynumber9.uk` (Cloudflare Pages, project `number9-app`)
- **Supabase**: project `dqsmpdetiqsqfnidekik` (Mumbai)

## Prerequisites

```bash
# All dependencies are pre-installed. No apt-get needed.
# Chromium is at /usr/bin/chromium (v148).
# Node 24, npm 11 confirmed working.
node --version   # v24.15.0
chromium --version  # Chromium 148.0.7778.178
```

No extra packages required. Both apps' `node_modules` are already present.

## Run (agent path) — smoke.sh

The driver is `.claude/skills/run-number9/smoke.sh`. Run from repo root:

```bash
# Local only — dev servers + screenshots, NO live production calls.
# This is the verified-safe default under the "don't touch live" constraint.
bash .claude/skills/run-number9/smoke.sh --no-api

# Full run: live auth-login check + both dev servers + screenshot both apps, then stop
bash .claude/skills/run-number9/smoke.sh

# Leave servers running after screenshots (for further interaction)
bash .claude/skills/run-number9/smoke.sh --no-api --keep

# Only test the Supabase API (no dev servers, fastest check — hits live prod)
bash .claude/skills/run-number9/smoke.sh --api-only
```

Screenshots land in `/tmp/n9-screenshots/` (`angular-signin.png`, `react-login.png`).
`--no-api` runs end-to-end and exits 0 — verified this session.

### Manual screenshot commands (verified working this session)

If servers are already running. `smoke.sh` puts Angular on **:4201** and Vite on
the **first free port from 5175** (was **5177** this run — parse it, see Gotchas):

```bash
mkdir -p /tmp/n9-screenshots

# Angular sign-in page (smoke.sh's dev server is on :4201)
chromium --headless=new --disable-gpu --window-size=1280,800 \
  --screenshot=/tmp/n9-screenshots/angular-signin.png \
  http://localhost:4201/auth/sign-in

# React login page — substitute the actual Vite port (HashRouter → /#/login)
PORT=$(grep -oP '(?<=localhost:)\d+' /tmp/n9-react.log | head -1)
chromium --headless=new --disable-gpu --window-size=1280,800 \
  --virtual-time-budget=3000 \
  --screenshot=/tmp/n9-screenshots/react-login.png \
  "http://localhost:${PORT}/#/login"
```

Both produced ~0.5 MB PNGs showing the real sign-in / login forms (not blank,
not an error page) — confirmed by viewing them.

## Run (human path)

```bash
# Angular admin — opens at http://localhost:4200
npm start

# React user — opens at http://localhost:5175 (or fallback port)
cd NUMBER9 && npm run dev:user
```

Both respond within ~10 seconds. `npm start` runs `ng serve --open`; the `--open` tries to launch a browser and silently fails headless — the server itself still starts.

## Build

```bash
# Angular admin → dist/number9systemd/browser/  (~19s, verified)
npm run build

# React user → NUMBER9/dist/  (<1s, verified)
cd NUMBER9 && npm run build
```

The Angular `build` script (`package.json`) runs `node scripts/set-env.js` then
`ng build`, and copies **`_redirects`, `_headers`, AND `_worker.js`** into
`dist/number9systemd/browser/`. So after `npm run build` the gateway worker is
already in place — verified this session:

```bash
ls dist/number9systemd/browser/ | grep -E '_worker|_redirects|_headers'
# _headers  _redirects  _worker.js   ← all three present
```

## Deploy

> Not re-run this session (no-touch-live). Commands preserved from prior verification.
> `npm run build` already copies `_worker.js` into the dist, so the old manual
> `cp _worker.js …` step is no longer needed.

```bash
# Angular → Cloudflare Pages (one-shot: build + deploy)
npm run deploy          # = build + wrangler pages deploy … --project-name=number9-admin

# …or deploy an already-built dist manually:
npx wrangler pages deploy dist/number9systemd/browser --project-name number9-admin

# React → Cloudflare Pages
cd NUMBER9 && npm run deploy   # = build + wrangler pages deploy dist --project-name=number9-app
```

## Edge Functions

```bash
supabase functions deploy auth-login  --project-ref dqsmpdetiqsqfnidekik
supabase functions deploy user-login  --project-ref dqsmpdetiqsqfnidekik
supabase functions deploy admin-proxy --project-ref dqsmpdetiqsqfnidekik
```

Env var required: `N9_SERVICE_ROLE_KEY` (already set in Supabase dashboard secrets).

## API Smoke Test (curl)

> These hit **live production Supabase** (login + read). `smoke.sh` runs the
> `auth-login` check as its first step. Skip with care if you must avoid
> touching live (e.g. run the driver's local screenshot path manually instead).

```bash
SUPABASE_URL="https://dqsmpdetiqsqfnidekik.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0"

# 1. Admin login (should return {"success":true,...})
curl -s -X POST "$SUPABASE_URL/functions/v1/auth-login" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"username":"hemo","password":"Admin@9999","email":"hemo@number9.local"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK token:', d['token'][:16]+'...' if d.get('success') else 'FAIL:'+d.get('error','?'))"

# 2. Check pending deposits count
curl -s "$SUPABASE_URL/rest/v1/transactions?type=eq.DEPOSIT&status=eq.PENDING" \
  -H "apikey: $ANON_KEY" | python3 -c "import sys,json; print('Pending deposits:', len(json.load(sys.stdin)))"
```

## Admin Users

| Username | Password | Email |
|----------|----------|-------|
| `hemo` | `Admin@9999` | hemo@number9.local |
| `number9` | `Admin@9999` | number9@number9.local |

## Database

> ⚠️ These run against **live production** and the last two **mutate the DB**
> (`UPDATE`/`DELETE`). Standing constraint: do **not** change the DB without
> explicit permission. The `SELECT` is read-only and safe; treat the password
> reset and rate-limit clear as break-glass only.

```bash
export PATH="$HOME/.local/share/supabase:$PATH"

# Query (read-only — safe)
supabase db query --linked "SELECT username, role FROM public.users WHERE role='admin';"

# Reset admin password (hash = Admin@9999)
supabase db query --linked "UPDATE public.users SET password_hash='\$2b\$10\$EUtXs/oo7TV/SzHHbSDcM.cOWBT85KKdZNEpY9LGpQ0i9EhsfZ0rm' WHERE role='admin';"

# Clear rate limits
supabase db query --linked "DELETE FROM public.failed_logins;"
```

Supabase CLI install if missing:
```bash
mkdir -p "$HOME/.local/share/supabase"
curl -sL https://github.com/supabase/cli/releases/download/v2.103.0/supabase_2.103.0_linux_amd64.tar.gz \
  | tar -xzf - -C "$HOME/.local/share/supabase"
```

## Gotchas

- **React uses HashRouter** — the URL for any route is `/#/<route>`, not `/<route>`. `http://localhost:5178/login` always shows the landing page; `http://localhost:5178/#/login` shows the login form.
- **React dev port may shift** — `npm run dev:user` requests port 5175 but Vite tries 5176, 5177, 5178… if lower ports are busy. Parse the actual port from the log: `grep -oP '(?<=localhost:)\d+' /tmp/n9-react.log | head -1`.
- **`--virtual-time-budget=3000` needed for React screenshots** — without it chromium exits before React's lazy-load completes and the screenshot is blank or shows only the shell.
- **`_worker.js` is now copied automatically by `npm run build`** — the Angular `build` script appends `cp _worker.js dist/number9systemd/browser/_worker.js`. (Historically this was a manual step; if you ever run a bare `ng build` instead of `npm run build`, you must copy it yourself or SPA routing on Cloudflare breaks.)
- **Production custom domains DO resolve from this container** — verified `admin.mynumber9.uk` and `app.mynumber9.uk` both return HTTP 200 and screenshot fine (corrects an earlier "unreachable" note). The admin **immutable** deploy URL (`<hash>.number9-admin.pages.dev`) returns **403** by design — the `_worker.js` gateway blocks direct pages.dev access (cookie auth / IP whitelist / Turnstile); a 403 there is the gateway working, not a broken deploy. The custom domain serves the login page through the gateway.
- **Angular deployment cached** — `admin.mynumber9.uk` may serve the old build for minutes after deploy. Check `https://master.number9-admin.pages.dev` for immediate confirmation.
- **Rate limiting** — 5 failed logins = 15-min lockout. Clear with `DELETE FROM public.failed_logins;`.
- **bcrypt hash prefix** — use `$2b$` (Python bcrypt), not `$2a$`. The `$2a$` hashes fail verification in the Edge Functions.
- **`npm start` has `--open`** — Angular's start script runs `ng serve --open` which tries to launch a browser. In headless envs it silently fails; the dev server still starts normally.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Login returns 401 "Invalid username or password" | Check admin user exists: `SELECT username FROM users WHERE role='admin'` |
| Login returns 429 "Too many failed attempts" | `DELETE FROM public.failed_logins WHERE username='<user>'` |
| admin-proxy returns 401 "Unauthorized" | Session token missing or expired — re-login. Verify Edge Function is deployed with latest code. |
| React screenshot is blank / shows landing page | Route must be `/#/login` not `/login`. Add `--virtual-time-budget=3000`. |
| Angular shows old JS bundle after deploy | Wait 2-3 min for CDN, or check `master.number9-admin.pages.dev` |
| `auth-login` returns 500 | POST missing JSON body, or `N9_SERVICE_ROLE_KEY` not set in Supabase secrets |
| NG8107 warnings on build | Optional chaining `?.` on non-nullable — remove the `?` |
| React dev server not on 5175 | Check `/tmp/n9-react.log` for actual port |
