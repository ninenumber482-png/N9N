-- NUMBER9 — Cleanup orphan objects & fix remaining raw token comparisons
--
-- Fixes:
--   1. get_user_id() — compared raw token_hash = raw token, but token_hash
--      now stores SHA-256 hash. Must hash the token before lookup.
--      Affected policies: wallet_read_own, wallet_update_own,
--      transactions_read_own, transactions_update_own, users_read_own
--   2. deposit_locks_own policy — raw comparison, not hashed
--
-- These objects were created outside the migration system (likely via
-- Supabase Dashboard SQL Editor) and were missed by the initial hash
-- migration (20260605000000).

BEGIN;

-- =============================================================================
-- 1. FIX get_user_id() — hash x-user-token before comparing against token_hash
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  token TEXT;
  found_user_id UUID;
BEGIN
  token := current_setting('request.headers', true)::json->>'x-user-token';
  IF token IS NULL OR token = '' THEN RETURN NULL; END IF;

  SELECT user_id INTO found_user_id
  FROM sessions
  WHERE token_hash = encode(digest(token, 'sha256'), 'hex')
    AND expires_at > now()
  LIMIT 1;

  RETURN found_user_id;
END;
$function$;

-- =============================================================================
-- 2. FIX deposit_locks_own policy — use hashed token comparison
-- =============================================================================
DROP POLICY IF EXISTS "deposit_locks_own" ON deposit_locks;

CREATE POLICY "deposit_locks_own" ON deposit_locks
FOR ALL TO anon
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = deposit_locks.user_id
      AND users.session_token = encode(digest(current_setting('request.headers', true)::json->>'x-user-token', 'sha256'), 'hex')
      AND users.session_expires_at > NOW()
  )
);

-- =============================================================================
-- 3. Verify — ANALYZE for index stats
-- =============================================================================
ANALYZE sessions;

COMMIT;
