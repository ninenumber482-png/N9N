#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# NUMBER9 CI Pipeline
# Jalankan: bash scripts/ci.sh
#
# Steps:
#   1. Regression test DB (settle_session, invariant check)
#   2. Build Angular admin
#   3. Build React user
#   4. Deploy Edge Functions (admin-proxy)
#   5. Deploy to Cloudflare Pages
# =============================================================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0

echo "============================================"
echo " NUMBER9 CI Pipeline"
echo "============================================"

# ── Step 1: Regression test ──────────────────────────────────────────────────
echo ""
echo "=== [1/5] Regression Test ==="
if supabase db query --linked --file "$ROOT_DIR/scripts/regression-test.sql" 2>&1 | grep -E "error|ERROR|FAIL|ROLLBACK" > /dev/null; then
  echo "❌ Regression test FAILED — ada invariant yang dilanggar!"
  exit 1
else
  echo "✅ Regression test PASSED"
fi

# ── Step 2: Build Angular Admin ──────────────────────────────────────────────
echo ""
echo "=== [2/5] Build Angular Admin ==="
cd "$ROOT_DIR"
if npm run build 2>&1; then
  echo "✅ Angular build PASSED"
else
  echo "❌ Angular build FAILED"
  FAIL=1
fi

# ── Step 3: Build React User ─────────────────────────────────────────────────
echo ""
echo "=== [3/5] Build React User ==="
cd "$ROOT_DIR/NUMBER9"
if npm run build 2>&1; then
  echo "✅ React build PASSED"
else
  echo "❌ React build FAILED"
  FAIL=1
fi

# ── Step 4: Deploy Edge Functions ────────────────────────────────────────────
echo ""
echo "=== [4/5] Deploy Edge Functions ==="
cd "$ROOT_DIR"
if supabase functions deploy admin-proxy 2>&1; then
  echo "✅ admin-proxy deployed"
else
  echo "❌ admin-proxy deploy FAILED"
  FAIL=1
fi

# ── Step 5: Deploy Cloudflare Pages ──────────────────────────────────────────
echo ""
echo "=== [5/5] Deploy Cloudflare Pages ==="
cd "$ROOT_DIR"
if npx wrangler pages deploy "$ROOT_DIR/dist/number9systemd/browser" --project-name number9-admin 2>&1; then
  echo "✅ Admin Pages deployed"
else
  echo "❌ Admin Pages deploy FAILED"
  FAIL=1
fi

cd "$ROOT_DIR/NUMBER9"
if npx wrangler pages deploy "$ROOT_DIR/NUMBER9/dist" --project-name number9-app 2>&1; then
  echo "✅ User Pages deployed"
else
  echo "❌ User Pages deploy FAILED"
  FAIL=1
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
if [ "$FAIL" -eq 0 ]; then
  echo " ✅ CI Pipeline SUKSES — semua langkah beres"
else
  echo " ❌ CI Pipeline GAGAL — ada langkah error"
fi
echo "============================================"
exit "$FAIL"
