#!/usr/bin/env bash
# smoke.sh — start NUMBER9 dev servers locally, screenshot both SPAs, run API check
# Usage:
#   bash .claude/skills/run-number9/smoke.sh            # screenshot + kill servers
#   bash .claude/skills/run-number9/smoke.sh --keep     # leave servers running after screenshots
#   bash .claude/skills/run-number9/smoke.sh --api-only # skip dev servers, only test Supabase API
#   bash .claude/skills/run-number9/smoke.sh --no-api   # local only: skip the live auth-login call
#                                                       #   (alias: --local) — constraint-safe path
#
# Paths relative to repo root. Screenshots land in /tmp/n9-screenshots/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SHOTS_DIR="/tmp/n9-screenshots"
mkdir -p "$SHOTS_DIR"

KEEP=false; API_ONLY=false; NO_API=false
for arg in "${@}"; do
  [[ "$arg" == "--keep" ]] && KEEP=true
  [[ "$arg" == "--api-only" ]] && API_ONLY=true
  [[ "$arg" == "--no-api" || "$arg" == "--local" ]] && NO_API=true
done

NG_PID="" REACT_PID=""
cleanup() {
  [[ "$KEEP" == true ]] && return
  [[ -n "$NG_PID" ]] && kill "$NG_PID" 2>/dev/null || true
  [[ -n "$REACT_PID" ]] && kill "$REACT_PID" 2>/dev/null || true
}
trap cleanup EXIT

# ─── Supabase API smoke test ───────────────────────────────────────────────
SUPABASE_URL="https://dqsmpdetiqsqfnidekik.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0"

if [[ "$NO_API" == true ]]; then
  echo "=== API smoke test SKIPPED (--no-api / --local): no live production calls ==="
else
  echo "=== API smoke test (auth-login Edge Function) — hits live production ==="
  API_RESP=$(curl -s -X POST "$SUPABASE_URL/functions/v1/auth-login" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ANON_KEY" \
    -d '{"username":"hemo","password":"Admin@9999","email":"hemo@number9.local"}' 2>/dev/null)
  API_OK=$(echo "$API_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('success') else 'FAIL:'+d.get('error','?'))" 2>/dev/null || echo "FAIL:parse_error")
  echo "  auth-login: $API_OK"
fi

[[ "$API_ONLY" == true ]] && exit 0

# ─── Angular dev server (port 4201, avoids clash with port 4200 if already used) ─
echo ""
echo "=== Starting Angular dev server on :4201 ==="
cd "$REPO_ROOT"
npm start -- --port 4201 > /tmp/n9-ng.log 2>&1 &
NG_PID=$!

for i in $(seq 1 60); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:4201/ 2>/dev/null | grep -q "200"; then
    echo "  Angular ready after ${i}s"
    break
  fi
  sleep 2
done

echo "=== Screenshot: Angular sign-in ==="
chromium --headless=new --disable-gpu --window-size=1280,800 \
  --screenshot="$SHOTS_DIR/angular-signin.png" \
  http://localhost:4201/auth/sign-in 2>/dev/null
echo "  → $SHOTS_DIR/angular-signin.png"

# ─── React dev server (Vite, mode=user) ────────────────────────────────────
echo ""
echo "=== Starting React dev server ==="
cd "$REPO_ROOT/NUMBER9"
VITE_PORT=5175 VITE_APP_MODE=user npx vite --mode user > /tmp/n9-react.log 2>&1 &
REACT_PID=$!

# Vite may skip ports if busy — parse actual port from log
REACT_PORT=""
for i in $(seq 1 30); do
  REACT_PORT=$(grep -oP '(?<=localhost:)\d+' /tmp/n9-react.log 2>/dev/null | head -1 || true)
  [[ -n "$REACT_PORT" ]] && break
  sleep 1
done
echo "  React on port: ${REACT_PORT:-unknown}"

if [[ -n "$REACT_PORT" ]]; then
  # Wait for Vite to be ready
  for i in $(seq 1 15); do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$REACT_PORT/" 2>/dev/null | grep -q "200"; then
      break
    fi
    sleep 1
  done
  echo "=== Screenshot: React login (HashRouter → /#/login) ==="
  chromium --headless=new --disable-gpu --window-size=1280,800 \
    --virtual-time-budget=3000 \
    --screenshot="$SHOTS_DIR/react-login.png" \
    "http://localhost:${REACT_PORT}/#/login" 2>/dev/null
  echo "  → $SHOTS_DIR/react-login.png"
fi

echo ""
echo "=== Done. Screenshots in $SHOTS_DIR ==="
ls "$SHOTS_DIR/"
echo ""
if [[ "$KEEP" == true ]]; then
  echo "Servers kept running: Angular :4201, React :${REACT_PORT:-?}"
fi

# Explicit success: without this, the final `[[ ... ]] && echo` above returns 1
# on every non-keep run and the whole script exits non-zero on success.
exit 0
