-- Fix: PostgREST "Could not choose the best candidate function" on submit_deposit.
--
-- Two overloads existed in the live DB:
--   * submit_deposit(uuid, numeric, varchar, text, varchar)  -- hardened (x-user-token check), kept
--   * submit_deposit(uuid, numeric, text,    text, text)     -- ORPHAN, created out-of-band via SQL editor
--
-- The orphan was never in a migration. It has NO caller-identity verification AND was
-- granted EXECUTE to PUBLIC + anon, so it was also an unauthenticated deposit-spoofing
-- path (any anon could pass an arbitrary p_user_id). Dropping it resolves the PostgREST
-- ambiguity AND closes the bypass. The varchar signature (with the x-user-token check
-- from 20260602220000_fix_all_bypasses.sql) remains the single authoritative function.

DROP FUNCTION IF EXISTS public.submit_deposit(uuid, numeric, text, text, text);
