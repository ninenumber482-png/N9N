---
name: run-number9-user
description: Build, start, and drive the NUMBER9 React user betting app (the NUMBER9/ Vite app). Use when asked to run, start, launch, serve, screenshot, or smoke-test the user-facing / landing-page / betting frontend on a clean machine.
---

# Run: NUMBER9 React user app

The user-facing SPA (landing page, login, register, betting, wallet). Vite +
React 19 + HashRouter, served on **port 5175**. It talks to Supabase; the
public landing page renders fine without a backend (it swallows the failed
config query), so a smoke test does not need live Supabase.

An agent in a headless container can't open a browser window, so "run it"
means: start the dev server, then drive headless Chromium with the committed
driver and **look at the screenshots**.

> **All paths below are relative to `NUMBER9/`.** `cd` there first.
> The driver lives at `.claude/skills/run-number9-user/driver.mjs` and writes
> screenshots to `.claude/skills/run-number9-user/shots/`.

## Prerequisites

System Chromium or Chrome (the driver uses it — Playwright's *bundled*
browser is not installed here):

```bash
# Already present in this container: /usr/bin/chromium (148), /usr/bin/google-chrome (149)
which chromium || which google-chrome
```

`playwright-core` is required by the driver. It is **not** a NUMBER9
dependency — it lives in the **repo-root** `node_modules` (the sibling Angular
app depends on it). The driver resolves it from there automatically. If it's
missing, install at the repo root: `cd .. && npm install`.

## Setup

```bash
npm install          # deps for the React app (idempotent; "up to date" if cached)
```

`.env.user` must exist in `NUMBER9/` with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_KEY` (already present here). Without it the landing page still
renders but auth/data calls fail silently.

## Run — dev server + driver (agent path)

Start the dev server in the background and **poll the port** (don't `sleep`):

```bash
npm run dev:user > /tmp/n9-dev.log 2>&1 &
echo $! > /tmp/n9-dev.pid
timeout 40 bash -c 'until curl -sf http://localhost:5175/ >/dev/null; do sleep 1; done' && echo "✓ up"
```

Drive it — loads `/`, `/#/login`, `/#/register`, screenshots each, and fails
on any console error:

```bash
node .claude/skills/run-number9-user/driver.mjs smoke
```

Expected: three 📸 lines + `✓ no console errors`, exit 0. Screenshots land in
`.claude/skills/run-number9-user/shots/{landing,login,register}.png`.
**Open them** — `landing.png` should show the "Global Partnerships for
Sustainable Growth" hero, partner logos, and Values/stats sections; a blank
or error frame means it didn't really mount.

One-off screenshot of any URL:

```bash
node .claude/skills/run-number9-user/driver.mjs shot "http://localhost:5175/#/login" login-check
```

Stop the server when done (prefer the pidfile; the `pkill` fallback uses a
pattern that won't match its own shell):

```bash
kill $(cat /tmp/n9-dev.pid) 2>/dev/null || pkill -f "node_modules/.bin/vite"
```

Driver env overrides: `BASE_URL` (default `http://localhost:5175`), `CHROME`
(path to the browser binary).

## Run — human path

```bash
npm run dev:user     # serves http://localhost:5175 in the foreground; Ctrl-C to stop
```

Useless headless (no window). Use the driver above instead.

## Build (production)

```bash
npm run build        # → dist/  (must use this script, NOT bare `vite build`)
```

Verified output: `index.html` + split chunks (`RegisterPage`, `GamePage`
lazy-loaded). The 624 kB main-chunk size warning is expected and harmless.

## Gotchas

- **HashRouter — routes carry `#`.** It's `/#/login` and `/#/register`, not
  `/login`. Navigating to `/login` (no hash) just serves the landing page
  (the SPA catch-all). The driver's `smoke` uses the correct hash routes.
- **`--mode user` is mandatory and baked into the npm scripts.** Running bare
  `vite` / `vite build` skips loading `.env.user`, leaving the Supabase client
  null and (silently) falling back to localStorage. Always use `dev:user` /
  `build`, never `vite` directly.
- **Playwright's bundled Chromium isn't installed.** `chromium.executablePath()`
  points at a non-existent `chromium-1155`. The driver ignores that and launches
  the **system** browser via `executablePath` + `--no-sandbox`. Override with
  `CHROME=/path` if needed.
- **`playwright-core` is not a NUMBER9 dep.** It's resolved from the repo-root
  `node_modules`. If you run the driver after a fresh clone where only NUMBER9
  deps are installed, also run `npm install` at the repo root.
- **`networkidle` is safe on public pages only.** Landing/login/register fire a
  single Supabase query then settle. Authenticated pages (dashboard, betting)
  use 5 s polling and may never reach `networkidle` — `waitForSelector` on the
  element you need instead of waiting for idle.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `playwright-core not found` | `cd ..` (repo root) and `npm install`; the driver reads it from root `node_modules`. |
| Driver: `no system chromium/chrome found` | `apt-get install -y chromium` or set `CHROME=/usr/bin/google-chrome`. |
| `smoke` returns landing page for `/#/login` | You dropped the `#` — routes are hash-based. |
| Port 5175 `EADDRINUSE` | A server is already running: `pkill -f "node_modules/.bin/vite"` then relaunch. (Don't `pkill -f "vite --mode user"` — that string is in the kill command's own argv, so it SIGTERMs its own shell, exit 144.) |
| Landing renders but login/data broken | `.env.user` missing or `--mode user` not used — check the dev log for the Vite mode banner (`VITE … user`). |
