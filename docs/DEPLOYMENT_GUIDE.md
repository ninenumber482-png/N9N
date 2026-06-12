# 🚀 Deployment Guide — NUMBER9 System

## Overview
Comprehensive guide untuk deployment fullstack NUMBER9 (React + Angular + Supabase + EC2 Bot).

---

## 📦 **1. Database Migrations**

### Run All Pending Migrations
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9
supabase db push
```

### Verify Migration Status
```bash
supabase migration list
```

### Latest Critical Migrations
- **`20260605080000_fix_daily_reconciliation.sql`**
  - Fixed ledger reconciliation formula (all-time vs daily scope)
  - Adds security alerts for mismatches
  
- **`20260605090000_engine_settle_rpc.sql`**
  - New `engine_settle()` RPC with API key authentication
  - Bot engine can settle sessions without privilege escalation

---

## ☁️ **2. Cloudflare Worker Deployment**

### Deploy Server Monitor
```bash
cd cloudflare-worker
wrangler deploy
```

**Expected Output:**
```
✓ Deployed server-monitor
  https://server-monitor.ninenumber482.workers.dev
```

### Test Endpoint
```bash
curl https://server-monitor.ninenumber482.workers.dev
```

**Expected Response:**
```json
{
  "cpu": 0.1,
  "ram": 37.9
}
```

### Configuration
- **URL:** `https://server-monitor.ninenumber482.workers.dev`
- **EC2 Target:** `http://ec2-107-22-51-206.compute-1.amazonaws.com:5000/status`
- **API Key:** `<MONITOR_API_KEY>` (same as bot engine)
- **CORS:** Allows `https://admin.mynumber9.uk`

---

## 🤖 **3. EC2 Bot Engine**

### Current Status
✅ **No update needed** — Bot already uses `engine_settle()` RPC

### Verify Bot Configuration
```python
# bot_monitor.py (line 136-141)
supabase_rpc('engine_settle', {
    'p_api_key': API_KEY,  # <MONITOR_API_KEY>
    'p_code': code,
    'p_d1': digits[0], 'p_d2': digits[1], 'p_d3': digits[2],
})
```

### Restart Bot (if needed)
```bash
sudo systemctl restart bot_monitor
sudo systemctl status bot_monitor
```

### Check Bot Logs
```bash
sudo journalctl -u bot_monitor -f
```

---

## 🌐 **4. Frontend Deployment**

### A. React Frontend (NUMBER9/)
```bash
cd NUMBER9
npm run build
# Deploy dist/ ke Cloudflare Pages: app.mynumber9.uk
```

### B. Angular Admin (src/)
```bash
npm run build
# Deploy dist/ ke Cloudflare Pages: admin.mynumber9.uk
```

### Environment Variables
Pastikan `.env` files tersedia:
```bash
# NUMBER9/.env
VITE_SUPABASE_URL=https://dqsmpdetiqsqfnidekik.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

# Angular environment.prod.ts
supabaseUrl: 'https://dqsmpdetiqsqfnidekik.supabase.co'
supabaseKey: 'eyJhbGciOi...'
```

---

## 🧪 **5. Testing Checklist**

### Critical Tests

#### ✅ 1. Session Expiry Flow
```bash
# Steps:
1. Login ke app.mynumber9.uk
2. Tunggu 30+ menit (session expired)
3. Refresh atau navigate
4. Expected: Auto-redirect ke login dengan toast "Session expired"
```

#### ✅ 2. Deposit Proof Upload Errors
```bash
# Steps:
1. Buka Wallet → Deposit
2. Upload corrupt/unreadable file
3. Expected: Toast error "Cannot read file. Try another."
```

#### ✅ 3. Daily Reconciliation
```bash
# Manual trigger (admin only)
supabase functions invoke daily-reconciliation

# Check alerts
SELECT * FROM security_alerts 
WHERE alert_type = 'LEDGER_MISMATCH' 
ORDER BY created_at DESC LIMIT 5;
```

#### ✅ 4. EC2 Monitor Widget (Angular Admin)
```bash
# Steps:
1. Login ke admin.mynumber9.uk
2. Navigate ke System Config page
3. Expected: Widget shows CPU/RAM dengan auto-refresh 5s
4. Server status: Online (green dot)
```

### API Endpoint Tests
```bash
# Test server monitor
curl https://server-monitor.ninenumber482.workers.dev

# Test engine settle (requires valid session code)
curl -X POST https://dqsmpdetiqsqfnidekik.supabase.co/rest/v1/rpc/engine_settle \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_api_key": "<MONITOR_API_KEY>",
    "p_code": "202606051550",
    "p_d1": 5, "p_d2": 7, "p_d3": 3
  }'
```

---

## 🔐 **6. Security Configuration**

### API Key Management

**Current Keys:**
- Engine API Key: `<MONITOR_API_KEY>` (stored in `platform_config.engine_api_key`)
- Bot Monitor API Key: `<MONITOR_API_KEY>` (same, in `bot_monitor.py`)
- Telegram Bot Token: `(env TELEGRAM_BOT_TOKEN)`

**Rotation Procedure:**
```sql
-- Update engine_api_key
UPDATE platform_config 
SET value = 'NEW_KEY_HERE' 
WHERE key = 'engine_api_key';

-- Update bot_monitor.py → API_KEY
-- Update cloudflare-worker/server-monitor.js → API_KEY
-- Restart bot & redeploy worker
```

### RLS Policies
```sql
-- Verify RLS enabled on critical tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('wallet', 'transactions', 'bets', 'king_results');
```

---

## 📊 **7. Monitoring & Alerts**

### Realtime Monitoring
- **Angular Admin Dashboard:** https://admin.mynumber9.uk
  - EC2 CPU/RAM (auto-refresh 5s)
  - Platform config (maintenance mode, king status)
  
- **Telegram Bot:** `/status` command
  - Server metrics
  - Engine status
  - Last settlement timestamp

### Security Alerts
```sql
-- Recent alerts
SELECT * FROM security_alerts 
ORDER BY created_at DESC 
LIMIT 20;

-- Alert types
SELECT alert_type, severity, COUNT(*) 
FROM security_alerts 
GROUP BY alert_type, severity;
```

### Engine Health
```sql
-- Check engine status
SELECT * FROM engine_status;

-- Recent settlements
SELECT * FROM king_results 
ORDER BY session_code DESC 
LIMIT 10;
```

---

## 🐛 **8. Troubleshooting**

### Bot Not Settling Sessions
```bash
# Check bot logs
sudo journalctl -u bot_monitor -f

# Common issues:
- API key mismatch
- Database connection timeout
- Session code format error (should be YYYYMMDDHHMM)
```

### Server Monitor Widget Shows "Offline"
```bash
# Test EC2 endpoint directly
curl http://ec2-107-22-51-206.compute-1.amazonaws.com:5000/status \
  -H "X-API-KEY: <MONITOR_API_KEY>"

# Check Cloudflare Worker
curl https://server-monitor.ninenumber482.workers.dev

# Common issues:
- EC2 bot not running (restart: sudo systemctl restart bot_monitor)
- API key mismatch
- CORS error (check console)
```

### Deposit Upload Fails
```bash
# Check Supabase Storage buckets
supabase storage ls

# Verify storage policies
SELECT * FROM storage.policies 
WHERE bucket_id = 'proofs';
```

### Ledger Mismatch Alerts
```sql
-- Get reconciliation details
SELECT * FROM daily_reconciliation(CURRENT_DATE);

-- Manual audit
SELECT 
  (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type='DEPOSIT' AND status='COMPLETED') AS deposits,
  (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type='WITHDRAWAL' AND status='COMPLETED') AS withdrawals,
  (SELECT COALESCE(SUM(stake), 0) FROM bets WHERE status='SETTLED') AS stakes,
  (SELECT COALESCE(SUM(actual_payout), 0) FROM bets WHERE result='WIN' AND status='SETTLED') AS wins,
  (SELECT COALESCE(SUM(balance_main), 0) FROM wallet) AS balance;
```

---

## 📝 **9. Rollback Procedure**

### Rollback Migrations
```bash
# Revert last migration
supabase migration repair --status reverted <timestamp>

# Example
supabase migration repair --status reverted 20260605090000
```

### Rollback Frontend
```bash
# Angular Admin
cd src
git checkout HEAD~1 -- .
npm run build

# React
cd NUMBER9
git checkout HEAD~1 -- .
npm run build
```

### Rollback Bot
```bash
git checkout HEAD~1 -- bot_monitor.py
sudo systemctl restart bot_monitor
```

---

## ✅ **10. Post-Deployment Verification**

### Smoke Tests
- [ ] Login works (app.mynumber9.uk)
- [ ] Dashboard loads dengan realtime balance
- [ ] Deposit form accepts amount & proof
- [ ] Wallet page shows turnover progress
- [ ] Game page shows session countdown
- [ ] Admin dashboard loads server monitor widget
- [ ] Bot responds to Telegram `/status` command

### Performance Checks
- [ ] React app loads < 2s (LCP)
- [ ] Angular admin loads < 3s (FCP)
- [ ] API response times < 500ms (p95)
- [ ] Database query times < 100ms (p95)

### Security Checks
- [ ] RLS policies active on all tables
- [ ] API keys rotated (if needed)
- [ ] No leaked credentials in logs
- [ ] HTTPS enforced on all endpoints

---

## 🎯 **Quick Reference**

| Service | URL | Credentials |
|---------|-----|-------------|
| React App | https://app.mynumber9.uk | User accounts |
| Angular Admin | https://admin.mynumber9.uk | Admin accounts |
| Supabase Dashboard | https://supabase.com/dashboard | Email login |
| Cloudflare Dashboard | https://dash.cloudflare.com | Email login |
| EC2 Instance | `ec2-107-22-51-206.compute-1.amazonaws.com` | SSH key |
| Telegram Bot | @YourBotUsername | Admin user IDs |

---

**Last Updated:** 2026-06-05  
**Deployment Version:** v2.4.1  
**Status:** ✅ Production Ready
