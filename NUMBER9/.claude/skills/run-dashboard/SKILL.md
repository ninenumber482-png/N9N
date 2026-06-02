---
name: run-dashboard
description: Run NUMBER9 dashboard React app on port 5175 with chromium-cli driver
---

# Run NUMBER9 Dashboard

## Overview

The **NUMBER9 dashboard** is a React 19 SPA built with Vite 8, TailwindCSS 4, and Zustand. It's a user gaming/betting platform with wallet, gaming features, and profile management.

The app runs headless via `chromium-cli` — no GUI window needed. The inline driver below controls it.

**Tech Stack:**
- React 19 + Vite 8 (dev server, port 5175)
- TailwindCSS 4, Zustand, React Router v7
- localStorage persistence for auth state

---

## Prerequisites

```bash
apt-get update && apt-get install -y nodejs npm chromium-browser
```

Verify: `node --version && npm --version && chromium-browser --version`

---

## Build

```bash
cd dashboard-react
npm install
```

---

## Run (Agent Path — chromium-cli Driver)

**Start dev server + drive with chromium-cli:**

```bash
cd dashboard-react
npm run dev > /tmp/dev.log 2>&1 &
sleep 4

# Wait for server
until curl -s http://localhost:5175 > /dev/null; do sleep 1; done

# Drive app
chromium-cli --run "
  (async () => {
    // Landing page
    await page.goto('http://localhost:5175', { waitUntil: 'networkidle' });
    await page.screenshot({ path: '/tmp/dashboard-landing.png', fullPage: true });
    console.log('✅ Landing page');
    
    // Login page
    await page.goto('http://localhost:5175/#/login', { waitUntil: 'networkidle' });
    await page.screenshot({ path: '/tmp/dashboard-login.png', fullPage: true });
    console.log('✅ Login page');
    
    // Check for UI elements
    const title = await page.title();
    console.log('Page title:', title);
    
    process.exit(0);
  })();
"

# Cleanup
pkill -f "vite"
```

**Output:**
```
✅ Landing page
✅ Login page
Page title: NUMBER9 - Global Partnerships
```

Screenshots: `/tmp/dashboard-landing.png`, `/tmp/dashboard-login.png`

---

## Run (Human Path)

```bash
cd dashboard-react
npm run dev
# Opens http://localhost:5175 (Ctrl-C to stop)
```

**Test credentials:**
```
Username: demo
Password: demo123
```

---

## Gotchas

1. **Dev server slow (4-8s):** Vite startup time. Script waits and polls.
2. **Port 5175 in use:** `lsof -ti:5175 | xargs kill -9`
3. **chromium-browser missing:** `apt-get install chromium-browser`
4. **Screenshots blank:** Increase `waitUntil: 'load'`, check `curl http://localhost:5175`
5. **Login form not showing:** Use hash routes: `http://localhost:5175/#/login` ✅ (not `/login`)

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `EADDRINUSE :::5175` | `lsof -ti:5175 \| xargs kill -9` |
| `Module not found: react` | `npm install` |
| Screenshot blank | Check dev.log: `cat /tmp/dev.log` |
| `chromium-cli` not found | `apt-get install chromium-browser` |

---

**Status:** ✅ Production-ready  
**Verified:** May 31, 2026
