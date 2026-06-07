---
name: run-number9
description: Run, build, screenshot, and smoke-test the NUMBER9 platform — Angular admin app and React user betting app. Use for deploy, verify, debug, or screenshot tasks.
---

# NUMBER9 Platform — Run Skill

Two SPAs sharing one Supabase backend. Driven via `curl` for API, `wrangler pages deploy` for Cloudflare Pages. No local server needed for verification — both apps are always live.

- **Angular Admin**: https://admin.mynumber9.uk (Cloudflare Pages, project `number9-admin`)
- **React User**: https://app.mynumber9.uk (Cloudflare Pages, project `number9-app`)
- **Supabase**: project `dqsmpdetiqsqfnidekik` (Mumbai)

## Prerequisites

```bash
npm install -g wrangler          # Deploy to Cloudflare Pages
export SUPABASE_GO_BINARY="$HOME/.local/share/supabase/supabase-go"
export PATH="$HOME/.local/share/supabase:$PATH"
```

Supabase CLI (if not installed):
```bash
mkdir -p "$HOME/.local/share/supabase"
curl -sL https://github.com/supabase/cli/releases/download/v2.103.0/supabase_2.103.0_linux_amd64.tar.gz \
  | tar -xzf - -C "$HOME/.local/share/supabase"
```

## Build

```bash
# Angular admin
npm run build
# Output: dist/number9systemd/browser/

# React user
cd NUMBER9 && npm run build
# Output: NUMBER9/dist/
```

Both build clean with no errors or warnings (verified 2026-06-07).

## Deploy (agent path)

```bash
# Angular → Cloudflare Pages
cp _worker.js dist/number9systemd/browser/
npx wrangler pages deploy dist/number9systemd/browser --project-name number9-admin

# React → Cloudflare Pages
cd NUMBER9
npx wrangler pages deploy dist --project-name number9-app
```

## Smoke Test (agent path)

```bash
# 1. Check both apps return 200
curl -s -o /dev/null -w "Angular: %{http_code}\n" https://admin.mynumber9.uk/
curl -s -o /dev/null -w "React: %{http_code}\n" https://app.mynumber9.uk/

# 2. Test admin login
curl -s -X POST https://dqsmpdetiqsqfnidekik.supabase.co/functions/v1/auth-login \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0' \
  -H 'Content-Type: application/json' \
  -d '{"username":"hemo","password":"Admin@9999","email":"hemo@number9.local"}' | jq .success

# 3. Test pending deposits
curl -s 'https://dqsmpdetiqsqfnidekik.supabase.co/rest/v1/transactions?type=eq.DEPOSIT&status=eq.PENDING' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0' | jq length
```

## Database (direct SQL via Supabase CLI)

```bash
export SUPABASE_GO_BINARY="$HOME/.local/share/supabase/supabase-go"
export PATH="$HOME/.local/share/supabase:$PATH"

# Query example
supabase db query --linked "SELECT username, role FROM public.users WHERE role='admin';"

# Reset admin password (password: Admin@9999)
supabase db query --linked "UPDATE public.users SET password_hash='\$2b\$10\$EUtXs/oo7TV/SzHHbSDcM.cOWBT85KKdZNEpY9LGpQ0i9EhsfZ0rm' WHERE role='admin';"

# Clear rate limits
supabase db query --linked "DELETE FROM public.failed_logins;"
```

## Admin Users

| Username | Password | Email |
|----------|----------|-------|
| `hemo` | `Admin@9999` | hemo@number9.local |
| `number9` | `Admin@9999` | number9@number9.local |

## Edge Functions

Deployed to Supabase project `dqsmpdetiqsqfnidekik`. Redeploy:

```bash
supabase functions deploy auth-login --project-ref dqsmpdetiqsqfnidekik
supabase functions deploy user-login --project-ref dqsmpdetiqsqfnidekik
supabase functions deploy admin-proxy --project-ref dqsmpdetiqsqfnidekik
```

Env var required: `N9_SERVICE_ROLE_KEY` (already set in Supabase secrets).

## Gotchas

- **Angular deployment cached**: `admin.mynumber9.uk` may serve old build for minutes after deploy. Check `https://master.number9-admin.pages.dev` for immediate confirmation.
- **Rate limiting**: 5 failed logins = 15 min lockout. Clear with `DELETE FROM public.failed_logins;`.
- **bcrypt hash format**: Use `$2b$` prefix (Python bcrypt), not `$2a$` (some JS libs). The `$2a$` hashes do NOT verify correctly via the Edge Functions.
- **Angular `dist/` is gitignored**: Never commit dist. Always deploy via `wrangler pages deploy`.
- **`_worker.js` must be copied**: `cp _worker.js dist/number9systemd/browser/` before every Angular deploy or SPA routing breaks.
- **Background session isolation**: `.claude/settings.json` has `"worktree": {"bgIsolation": "none"}` — background agents can edit main checkout directly.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Login returns 401 "Invalid username or password" | Check admin user exists: `SELECT username FROM users WHERE role='admin'` |
| Login returns 429 "Too many failed attempts" | `DELETE FROM public.failed_logins WHERE username='<user>'` |
| admin-proxy returns 401 "Unauthorized" | Session token missing or expired — re-login |
| Angular shows old JS bundle after deploy | Wait 2-3 min for CDN propagation, or check `master.number9-admin.pages.dev` |
| `auth-login` returns 500 (no body) | POST without JSON body — always send `{"username","password","email"}` |
| NG8107 warnings on build | Optional chaining `?.` on non-nullable type — remove `?` |
