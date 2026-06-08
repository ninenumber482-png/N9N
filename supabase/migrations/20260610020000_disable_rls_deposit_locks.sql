-- deposit_locks: disable RLS (consistent with wallet/transactions/bets pattern)
-- Auth enforced by SECURITY DEFINER RPCs and Edge Functions, not RLS.
ALTER TABLE public.deposit_locks DISABLE ROW LEVEL SECURITY;
