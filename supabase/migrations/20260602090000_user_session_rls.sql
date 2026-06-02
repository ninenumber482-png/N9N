-- Add session columns to users (for React app custom token auth)
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS users_session_token_idx ON users(session_token);

-- Enable RLS on sensitive tables (wallet, transactions, bets, kyc_documents)
-- NOTE: users table is NOT RLS-protected yet because registration flow
-- requires anonymous SELECT for referral validation & username check.
-- Future hardening: move registration to an Edge Function, then enable RLS on users.

ALTER TABLE wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running this migration
DROP POLICY IF EXISTS "wallet_own" ON wallet;
DROP POLICY IF EXISTS "transactions_own" ON transactions;
DROP POLICY IF EXISTS "bets_own" ON bets;
DROP POLICY IF EXISTS "kyc_own" ON kyc_documents;
DROP POLICY IF EXISTS "kyc_update_own" ON kyc_documents;
DROP POLICY IF EXISTS "kyc_delete_own" ON kyc_documents;
DROP POLICY IF EXISTS "kyc_insert_anon" ON kyc_documents;

-- Wallet: user can only access their own row via valid session token
CREATE POLICY "wallet_own" ON wallet
FOR ALL TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = wallet.user_id
      AND users.session_token = current_setting('request.headers', true)::json->>'x-user-token'
      AND users.session_expires_at > NOW()
  )
);

-- Transactions: user can only access their own row via valid session token
CREATE POLICY "transactions_own" ON transactions
FOR ALL TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = transactions.user_id
      AND users.session_token = current_setting('request.headers', true)::json->>'x-user-token'
      AND users.session_expires_at > NOW()
  )
);

-- Bets: user can only access their own row via valid session token
CREATE POLICY "bets_own" ON bets
FOR ALL TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = bets.user_id
      AND users.session_token = current_setting('request.headers', true)::json->>'x-user-token'
      AND users.session_expires_at > NOW()
  )
);

-- KYC Documents: user can only read/update/delete their own row via valid session token
-- INSERT is allowed anonymously because KYC docs are uploaded during registration
-- before the user has a session token.
CREATE POLICY "kyc_own" ON kyc_documents
FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = kyc_documents.user_id
      AND users.session_token = current_setting('request.headers', true)::json->>'x-user-token'
      AND users.session_expires_at > NOW()
  )
);

CREATE POLICY "kyc_update_own" ON kyc_documents
FOR UPDATE TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = kyc_documents.user_id
      AND users.session_token = current_setting('request.headers', true)::json->>'x-user-token'
      AND users.session_expires_at > NOW()
  )
);

CREATE POLICY "kyc_delete_own" ON kyc_documents
FOR DELETE TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = kyc_documents.user_id
      AND users.session_token = current_setting('request.headers', true)::json->>'x-user-token'
      AND users.session_expires_at > NOW()
  )
);

CREATE POLICY "kyc_insert_anon" ON kyc_documents
FOR INSERT TO anon
WITH CHECK (true);
