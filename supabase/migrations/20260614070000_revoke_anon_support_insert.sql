-- ============================================================================
-- Trailing revoke — apply ONLY AFTER the new React frontend (which uses the
-- create_ticket RPC) is live. Until then the old SupportPage direct-inserts.
-- NOT YET APPLIED to production.
-- ============================================================================
REVOKE INSERT ON public.support_tickets FROM anon, authenticated;
-- Reads/writes now exclusively via SECURITY DEFINER RPCs + admin-proxy (service_role).
