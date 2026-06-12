#!/usr/bin/env bash
set -euo pipefail

# ─── NUMBER9 Cloudflare Pages Deployment Script ─────────────────────────────
# Usage:
#   ./scripts/deploy-cloudflare.sh admin   → build & deploy Angular admin app
#   ./scripts/deploy-cloudflare.sh user    → build & deploy React user app
#   ./scripts/deploy-cloudflare.sh all     → build both (manual upload)
#
# Prerequisites:
#   - wrangler CLI installed (npm i -g wrangler)
#   - Logged into Cloudflare: wrangler login
#   - Two Cloudflare Pages projects created:
#     "number9-admin" and "number9-app"
# ──────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-all}"

deploy_admin() {
  echo "=== Building Angular Admin App ==="
  cd "$ROOT_DIR"

  # Load environment for build
  export NG_BUILD_CONFIGURATION=production
  export NG_PUBLIC_SUPABASE_URL="https://dqsmpdetiqsqfnidekik.supabase.co"
  export NG_PUBLIC_SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0"

  npm run build

  echo "=== Adding Cloudflare Pages Config ==="
  OUT="$ROOT_DIR/dist/number9systemd/browser"

  # SPA fallback (required for Angular standard routing)
  cat > "$OUT/_redirects" << 'EOF'
/* /index.html 200
EOF

  # Security headers
  cat > "$OUT/_headers" << 'EOF'
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
EOF

  cp "$ROOT_DIR/_worker.js" "$OUT/_worker.js"

  echo "=== Deploying Admin to Cloudflare Pages ==="
  npx wrangler pages deploy "$OUT" --project-name number9-admin
}

deploy_user() {
  echo "=== Building React User App ==="
  cd "$ROOT_DIR/NUMBER9"

  # Load environment from .env.user
  export VITE_SUPABASE_URL="https://dqsmpdetiqsqfnidekik.supabase.co"
  export VITE_SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0"

  npm run build

  echo "=== Adding Cloudflare Pages Config ==="
  OUT="$ROOT_DIR/NUMBER9/dist"

  # Security headers
  cat > "$OUT/_headers" << 'EOF'
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
EOF

  echo "=== Deploying User App to Cloudflare Pages ==="
  npx wrangler pages deploy "$OUT" --project-name number9-app
}

case "$APP" in
  admin) deploy_admin ;;
  user)  deploy_user ;;
  all)
    deploy_admin
    deploy_user
    echo "=== Both apps deployed successfully ==="
    ;;
  *)
    echo "Usage: $0 {admin|user|all}"
    exit 1
    ;;
esac
