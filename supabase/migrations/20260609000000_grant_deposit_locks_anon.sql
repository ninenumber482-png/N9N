-- Grant SELECT on deposit_locks to anon so the React app (anon key) can query
-- turnover status directly via Supabase client.
-- Without this grant the turnover check fails silently and withdrawal is blocked
-- with fetchError=true on the frontend.

GRANT SELECT ON public.deposit_locks TO anon;
GRANT SELECT ON public.deposit_locks TO authenticated;
