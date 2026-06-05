# 📚 RPC Endpoints Documentation

## Overview
Comprehensive documentation for Supabase RPC (Remote Procedure Call) endpoints di NUMBER9 platform.

---

## 🔑 **Authentication & Security**

### RPC Security Levels

| Level | Description | Example Functions |
|-------|-------------|------------------|
| **SECURITY DEFINER** | Runs with function owner privileges | `engine_settle`, `get_my_full_profile` |
| **SECURITY INVOKER** | Runs with caller privileges (default) | `place_bet`, `submit_deposit` |

### Required Headers
```bash
# All RPC calls require:
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
Content-Type: application/json

# User-authenticated RPCs also require:
x-user-token: <session_token_from_login>
```

---

## 🎮 **Game Engine RPCs**

### `engine_settle`
Settle a 3D King session with dice results.

**Access:** SECURITY DEFINER (anon role)  
**Purpose:** Allow EC2 bot to settle sessions securely without elevated database privileges

**Parameters:**
```typescript
{
  p_api_key: string,  // Engine API key (validated against platform_config.engine_api_key)
  p_code: string,     // Session code format: YYYYMMDDHHMM (e.g., "202606051550")
  p_d1: number,       // First digit (0-9)
  p_d2: number,       // Second digit (0-9)
  p_d3: number        // Third digit (0-9)
}
```

**Example:**
```bash
curl -X POST "$SUPABASE_URL/rest/v1/rpc/engine_settle" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_api_key": "362745",
    "p_code": "202606051550",
    "p_d1": 5,
    "p_d2": 7,
    "p_d3": 3
  }'
```

**Response:**
- Success: `204 No Content`
- Error: `500` with `ENGINE_UNAUTHORIZED` exception

**Internal Flow:**
1. Validates `p_api_key` against `platform_config.engine_api_key`
2. Calls internal `settle_session(p_code, p_d1, p_d2, p_d3)`
3. `settle_session` checks `king_planned` for admin overrides
4. Inserts result to `king_results` table
5. Updates all matching bets in `bets` table
6. Credits/debits user wallets atomically

**Security:**
- ✅ API key validation prevents unauthorized settlement
- ✅ SECURITY DEFINER allows anon calls without RLS bypass
- ✅ Internal transaction ensures atomicity

---

## 👤 **User Profile RPCs**

### `get_my_full_profile`
Get complete user profile for authenticated user.

**Access:** SECURITY DEFINER (authenticated role)  
**Purpose:** Fetch full user profile without RLS complications

**Parameters:** None (uses `auth.uid()` from session)

**Example:**
```bash
curl -X POST "$SUPABASE_URL/rest/v1/rpc/get_my_full_profile" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "id": "uuid",
  "username": "string",
  "full_name": "string",
  "email": "string",
  "phone": "string",
  "country": "string",
  "bank_name": "string",
  "bank_account_no": "string",
  "bank_account_holder": "string",
  "role": "string",
  "is_active": boolean,
  "login_enabled": boolean,
  "referral_code": "string",
  "referred_by_code": "string",
  "created_at": "timestamp"
}
```

**Error Handling:**
- `UNAUTHORIZED` → Session expired, force re-login
- `PGRST301` → Session invalid

**Frontend Integration (React):**
```javascript
// store/useStore.js
const { data, error } = await supabase.rpc('get_my_full_profile');
if (error?.message?.includes('UNAUTHORIZED') || error?.code === 'PGRST301') {
  // Session expired → force re-login
  return null;
}
return data;
```

---

## 💰 **Wallet RPCs**

### `submit_deposit`
Submit a deposit request with proof.

**Access:** SECURITY DEFINER (authenticated)  
**Parameters:**
```typescript
{
  amount: number,           // Deposit amount (min: platform_config value)
  payment_method_id: uuid,  // Selected payment method
  proof_url: string,        // Uploaded proof URL from storage
  idempotency_key: string   // Unique key to prevent duplicates
}
```

**Example:**
```javascript
const { data, error } = await supabase.rpc('submit_deposit', {
  amount: 100000,
  payment_method_id: 'uuid-here',
  proof_url: 'https://...storage.../proof.jpg',
  idempotency_key: 'dep_1234567890_abcdef'
});
```

**Response:**
```json
{
  "success": true,
  "transaction_id": "uuid"
}
```

**Validation:**
- Amount >= min_deposit (from platform_config)
- Payment method exists and is active
- Idempotency key prevents duplicate submissions
- User has active account

---

### `submit_withdrawal`
Request a withdrawal to bank account.

**Access:** SECURITY DEFINER (authenticated)  
**Parameters:**
```typescript
{
  amount: number,           // Withdrawal amount
  bank_name: string,        // Destination bank
  account_no: string,       // Account number
  account_holder: string,   // Account holder name
  idempotency_key: string   // Unique key
}
```

**Validation:**
- Amount <= available balance (balance_main - locked balance)
- Turnover requirement met (deposit × turnover_multiplier)
- Bank details provided
- Min withdrawal amount met

---

### `get_my_wallet_summary`
Get wallet summary with turnover progress.

**Access:** SECURITY DEFINER (authenticated)  
**Parameters:** None

**Response:**
```json
{
  "balance_main": number,
  "balance_locked": number,
  "balance_bonus": number,
  "total_turnover_required": number,
  "total_turnover_done": number,
  "turnover_remaining": number,
  "can_withdraw": boolean,
  "active_deposits": [
    {
      "deposit_id": "uuid",
      "amount": number,
      "turnover_required": number,
      "turnover_done": number,
      "is_unlocked": boolean
    }
  ]
}
```

---

## 🎲 **Betting RPCs**

### `place_bet`
Place a bet on 3D King session.

**Access:** SECURITY DEFINER (authenticated)  
**Parameters:**
```typescript
{
  session_code: string,     // Target session (e.g., "202606051550")
  contracts: [              // Array of contracts
    {
      type: "BIG" | "SMALL" | "ODD" | "EVEN" | "NUMBER",
      value: string,        // For NUMBER type: "0" to "27"
      stake: number         // Stake amount per contract
    }
  ],
  idempotency_key: string
}
```

**Example:**
```javascript
const { data, error } = await supabase.rpc('place_bet', {
  session_code: '202606051550',
  contracts: [
    { type: 'BIG', value: null, stake: 10000 },
    { type: 'ODD', value: null, stake: 10000 },
    { type: 'NUMBER', value: '15', stake: 5000 }
  ],
  idempotency_key: 'bet_1234567890_xyz'
});
```

**Response:**
```json
{
  "success": true,
  "bet_ids": ["uuid1", "uuid2", "uuid3"],
  "total_staked": 25000,
  "turnover_credited": 25000
}
```

**Validation:**
- Session is OPEN (not LOCKED/DRAWING/SETTLED)
- Sufficient balance_main
- Valid contract types
- Stake amounts meet minimums
- Idempotency prevents duplicate bets

---

## 🔧 **Admin RPCs**

### `admin_create_user`
Create a new user (admin only).

**Access:** SECURITY DEFINER (authenticated admin)  
**Parameters:**
```typescript
{
  username: string,
  full_name: string,
  email: string,
  password: string,
  phone: string,
  country: string,
  role: "user" | "admin",
  referral_code?: string
}
```

**Security:**
- Only users with `role = 'admin'` can call
- Hashes password with pgcrypto
- Generates unique referral code
- Creates wallet automatically

---

### `daily_reconciliation`
Run daily ledger reconciliation audit.

**Access:** service_role only (cron job)  
**Parameters:**
```typescript
{
  p_date: date  // Target date (default: CURRENT_DATE)
}
```

**Response:**
```sql
metric              | amount
--------------------+----------
today_deposits      | 1000000
today_withdrawals   | 500000
today_bet_stakes    | 300000
today_wins          | 200000
alltime_deposits    | 50000000
alltime_withdrawals | 20000000
alltime_bet_stakes  | 15000000
alltime_wins        | 10000000
current_balance     | 25000000
ledger_difference   | 0.00  -- Should always be 0!
```

**Formula:**
```
alltime_deposits - alltime_withdrawals - alltime_bet_stakes + alltime_wins = current_balance

If difference != 0 → Insert security_alerts with LEDGER_MISMATCH
```

**Scheduled Execution:**
```sql
-- pg_cron job (runs daily at 00:05 UTC)
SELECT cron.schedule(
  'daily-reconciliation',
  '5 0 * * *',
  $$ SELECT daily_reconciliation(CURRENT_DATE) $$
);
```

---

## 📊 **Referral RPCs**

### `get_my_downlines`
Get direct downline users.

**Access:** SECURITY DEFINER (authenticated)  
**Response:**
```json
{
  "total": 10,
  "active": 8,
  "pending": 2,
  "downlines": [
    {
      "username": "string",
      "full_name": "string",
      "status": "active" | "pending",
      "joined_at": "timestamp"
    }
  ]
}
```

---

### `get_referral_stats`
Get referral earnings and statistics.

**Access:** SECURITY DEFINER (authenticated)  
**Response:**
```json
{
  "referral_code": "N9-ABCD-1234",
  "total_referred": 25,
  "active_referred": 20,
  "total_earned": 500000,
  "this_month_earned": 50000,
  "lifetime_commission": 500000
}
```

---

## 🔐 **API Key Management**

### Rotation Procedure

**Step 1: Generate New Key**
```bash
NEW_KEY=$(openssl rand -hex 16)
echo $NEW_KEY  # Save this!
```

**Step 2: Update Database**
```sql
UPDATE platform_config 
SET value = 'NEW_KEY_HERE' 
WHERE key = 'engine_api_key';
```

**Step 3: Update Bot**
```python
# bot_monitor.py
API_KEY = os.environ.get('MONITOR_API_KEY', 'NEW_KEY_HERE')
```

**Step 4: Update Cloudflare Worker**
```javascript
// server-monitor.js
const API_KEY = 'NEW_KEY_HERE';
```

**Step 5: Restart Services**
```bash
sudo systemctl restart bot_monitor
cd cloudflare-worker && wrangler deploy
```

---

## 🧪 **Testing RPCs**

### Using cURL
```bash
# Set environment variables
export SUPABASE_URL="https://dqsmpdetiqsqfnidekik.supabase.co"
export ANON_KEY="eyJhbGci..."
export USER_TOKEN="eyJhbGci..."  # From login response

# Test get_my_full_profile
curl -X POST "$SUPABASE_URL/rest/v1/rpc/get_my_full_profile" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json"

# Test engine_settle
curl -X POST "$SUPABASE_URL/rest/v1/rpc/engine_settle" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_api_key": "362745",
    "p_code": "202606051600",
    "p_d1": 3, "p_d2": 7, "p_d3": 5
  }'
```

### Using Supabase Client (JavaScript)
```javascript
// Frontend (React/Angular)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Call RPC
const { data, error } = await supabase.rpc('get_my_full_profile');

if (error) {
  console.error('RPC error:', error);
  if (error.message?.includes('UNAUTHORIZED')) {
    // Handle session expiry
    window.location.href = '/login';
  }
} else {
  console.log('Profile:', data);
}
```

---

## 📝 **Best Practices**

### 1. Error Handling
```javascript
// Always handle UNAUTHORIZED for session expiry
const handleRPC = async (rpcName, params) => {
  const { data, error } = await supabase.rpc(rpcName, params);
  
  if (error) {
    if (error.message?.includes('UNAUTHORIZED') || error.code === 'PGRST301') {
      // Force re-login
      localStorage.clear();
      window.location.href = '/login';
      return null;
    }
    throw error;
  }
  
  return data;
};
```

### 2. Idempotency Keys
```javascript
// Generate unique idempotency keys
const newIdempotencyKey = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}_${random}`;
};

// Use in deposit/withdrawal/bet RPCs
const key = newIdempotencyKey();
await supabase.rpc('submit_deposit', { 
  ...params, 
  idempotency_key: key 
});
```

### 3. Retry Logic
```javascript
// Retry on network errors (not on validation errors)
const retryRPC = async (rpcName, params, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { data, error } = await supabase.rpc(rpcName, params);
      if (error && error.code !== 'PGRST116') {  // Not a timeout
        throw error;
      }
      return data;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
};
```

---

## 🚨 **Common Errors**

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `PGRST116` | Timeout | Retry request |
| `PGRST301` | Unauthorized | Re-login required |
| `23505` | Duplicate key (idempotency) | Request already processed |
| `23514` | Check constraint violation | Invalid parameter value |
| `P0001` | Raised exception (custom) | Check error message details |
| `ENGINE_UNAUTHORIZED` | Invalid API key | Check engine_api_key in platform_config |
| `INSUFFICIENT_BALANCE` | Not enough funds | Top up wallet |
| `SESSION_LOCKED` | Betting window closed | Wait for next session |

---

**Last Updated:** 2026-06-05  
**API Version:** v2.4.1  
**Supabase PostgreSQL:** 15.1
