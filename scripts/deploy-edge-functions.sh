#!/usr/bin/env bash
# Production Edge Functions — single source of truth for CI and GitHub Actions.
# See CLAUDE.md: auth wrappers, CORS proxies, uploads, admin-proxy.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_ID:-dqsmpdetiqsqfnidekik}"

FUNCTIONS=(
  auth-login
  auth-logout
  auth-validate
  user-login
  user-register
  admin-proxy
  admin-popup-image
  upload-proof
  upload-file
  audit-log
  get-profile-wrapper
  get-user-wallet
  place-bet-wrapper
  submit-deposit-wrapper
  submit-withdrawal-wrapper
  get-popup-banners
  get-turnover-summary
  fetch-news
)

for fn in "${FUNCTIONS[@]}"; do
  echo "  → $fn"
  supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done

echo "✅ ${#FUNCTIONS[@]} Edge Functions deployed"
