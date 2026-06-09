-- transactions + bets: disable RLS (consistent with deposit_locks pattern).
-- Auth enforced by SECURITY DEFINER RPCs and Edge Functions, not RLS.
-- Realtime subscriptions require RLS-skipped tables to deliver events.
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets DISABLE ROW LEVEL SECURITY;
