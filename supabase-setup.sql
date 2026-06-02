-- NUMBER9 Database Setup
-- Execute this in Supabase SQL Editor
-- Project: dqsmpdetiqsqfnidekik

-- =============================================================================
-- CREATE TABLES
-- =============================================================================

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20),
  country VARCHAR(50),
  role VARCHAR(20) DEFAULT 'user',
  account_status VARCHAR(20) DEFAULT 'ACTIVE',
  registration_status VARCHAR(20) DEFAULT 'APPROVED',
  login_status VARCHAR(20) DEFAULT 'ACTIVE',

  -- Bank details
  bank_name VARCHAR(100),
  bank_account_number VARCHAR(50),
  bank_account_name VARCHAR(100),

  -- Compliance
  kyc_status VARCHAR(20) DEFAULT 'PENDING',
  referral_code VARCHAR(20) UNIQUE,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),

  CHECK (username ~ '^[a-z0-9_]{3,}$')
);

CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- Wallet Table
CREATE TABLE IF NOT EXISTS wallet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_main DECIMAL(12,2) DEFAULT 0.00,
  balance_bonus DECIMAL(12,2) DEFAULT 0.00,
  total_deposited DECIMAL(12,2) DEFAULT 0.00,
  total_withdrawn DECIMAL(12,2) DEFAULT 0.00,
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS wallet_user_id_idx ON wallet(user_id);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',

  -- Deposits
  method VARCHAR(50),
  proof_image_url TEXT,

  -- Withdrawals
  bank_name VARCHAR(100),
  bank_account_number VARCHAR(50),
  bank_account_name VARCHAR(100),
  withdrawal_fee DECIMAL(12,2),

  -- Bets
  bet_code VARCHAR(20),
  payout DECIMAL(12,2),
  result VARCHAR(20),

  requested_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  processed_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON transactions(user_id);
CREATE INDEX IF NOT EXISTS transactions_type_idx ON transactions(type);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions(created_at);

-- Bets Table
CREATE TABLE IF NOT EXISTS bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_code VARCHAR(20) NOT NULL,
  bet_code VARCHAR(50) NOT NULL,
  selection VARCHAR(50) NOT NULL,
  stake DECIMAL(12,2) NOT NULL,
  potential_payout DECIMAL(12,2) NOT NULL,
  actual_payout DECIMAL(12,2),
  status VARCHAR(20) DEFAULT 'PENDING',
  result VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  settled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS bets_user_id_idx ON bets(user_id);
CREATE INDEX IF NOT EXISTS bets_session_code_idx ON bets(session_code);
CREATE INDEX IF NOT EXISTS bets_status_idx ON bets(status);

-- KYC Documents Table
CREATE TABLE IF NOT EXISTS kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type VARCHAR(50),
  document_url TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS kyc_documents_user_id_idx ON kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS kyc_documents_status_idx ON kyc_documents(status);

-- Audit Log Table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  old_value TEXT,
  new_value TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_admin_id_idx ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at);

-- =============================================================================
-- INSERT PERMANENT ACCOUNTS
-- =============================================================================

-- Admin Account: hemo / 362745
-- Password hash: $2b$12$9bfYtPyPPP.EdkFLh7ns8.KkpdZ9DZff0cjegYwN/6Fc.ww5c8wua
INSERT INTO users (
  id,
  username,
  password_hash,
  display_name,
  email,
  phone,
  country,
  role,
  account_status,
  registration_status,
  login_status,
  referral_code,
  created_at,
  approved_at
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'hemo',
  '$2b$12$9bfYtPyPPP.EdkFLh7ns8.KkpdZ9DZff0cjegYwN/6Fc.ww5c8wua',
  'Administrator',
  'hemo@number9.local',
  '',
  'Indonesia',
  'admin',
  'ACTIVE',
  'APPROVED',
  'ACTIVE',
  'N9-HEMO-ADMIN',
  NOW(),
  NOW()
)
ON CONFLICT (username) DO NOTHING;

-- User Account: aji / 362745
-- Display Name: arapah
-- Password hash: $2b$12$9bfYtPyPPP.EdkFLh7ns8.KkpdZ9DZff0cjegYwN/6Fc.ww5c8wua
INSERT INTO users (
  id,
  username,
  password_hash,
  display_name,
  email,
  phone,
  country,
  role,
  account_status,
  registration_status,
  login_status,
  referral_code,
  kyc_status,
  created_at,
  approved_at
) VALUES (
  'a0000000-0000-0000-0000-000000000002',
  'aji',
  '$2b$12$9bfYtPyPPP.EdkFLh7ns8.KkpdZ9DZff0cjegYwN/6Fc.ww5c8wua',
  'arapah',
  'aji@number9.local',
  '081234567890',
  'Indonesia',
  'user',
  'ACTIVE',
  'APPROVED',
  'ACTIVE',
  'N9-AJI-USER',
  'APPROVED',
  NOW(),
  NOW()
)
ON CONFLICT (username) DO NOTHING;

-- =============================================================================
-- CREATE WALLETS FOR PERMANENT USERS
-- =============================================================================

-- Admin wallet
INSERT INTO wallet (
  user_id,
  balance_main,
  balance_bonus,
  total_deposited,
  total_withdrawn
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  1000000.00,
  0.00,
  1000000.00,
  0.00
)
ON CONFLICT (user_id) DO NOTHING;

-- User (aji) wallet - 10,000 P initial balance
INSERT INTO wallet (
  user_id,
  balance_main,
  balance_bonus,
  total_deposited,
  total_withdrawn
) VALUES (
  'a0000000-0000-0000-0000-000000000002',
  10000.00,
  0.00,
  10000.00,
  0.00
)
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- VERIFY SETUP
-- =============================================================================

-- Show created users
SELECT id, username, display_name, role, account_status, created_at
FROM users
WHERE username IN ('hemo', 'aji')
ORDER BY created_at;

-- Show wallets
SELECT u.username, w.balance_main, w.total_deposited, w.total_withdrawn
FROM wallet w
JOIN users u ON u.id = w.user_id
WHERE u.username IN ('hemo', 'aji');

-- =============================================================================
-- SUMMARY
-- =============================================================================
-- Admin Account:
--   Username: hemo
--   Password: 362745
--   Role: admin
--   Balance: 1,000,000 P
--
-- User Account:
--   Username: aji
--   Password: 362745
--   Display Name: arapah
--   Role: user
--   Balance: 10,000 P
--
-- All tables created successfully!
-- Ready for frontend authentication!
