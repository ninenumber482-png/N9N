-- Allow anon users to create a wallet during registration.
-- The existing wallet_own (FOR ALL) policy would block INSERT
-- because new users don't have a session token yet.
CREATE POLICY "wallet_insert_anon" ON wallet
FOR INSERT TO anon
WITH CHECK (true);
