-- NUMBER9 — Fix search_path for pgcrypto digest() function
--
-- pgcrypto extension is installed in 'extensions' schema, not 'public'.
-- All SECURITY DEFINER functions using encode(digest(...), 'sha256')
-- must include 'extensions' in their search_path, otherwise:
--   "function digest(text, unknown) does not exist"

SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto' AND extversion = '1.3';

ALTER FUNCTION submit_deposit(UUID, DECIMAL, VARCHAR, TEXT, VARCHAR) SET search_path TO 'public, extensions';
ALTER FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) SET search_path TO 'public, extensions';
ALTER FUNCTION place_bet(UUID, VARCHAR, JSONB) SET search_path TO 'public, extensions';
ALTER FUNCTION session_heartbeat(TEXT) SET search_path TO 'public, extensions';
ALTER FUNCTION get_my_profile() SET search_path TO 'public, extensions';
ALTER FUNCTION get_user_id() SET search_path TO 'public, extensions';
ALTER FUNCTION get_current_user_id_for_kyc() SET search_path TO 'public, extensions';
ALTER FUNCTION get_my_kyc_documents() SET search_path TO 'public, extensions';

-- Also fix RLS policies that use digest() — these run in the query context,
-- not inside SECURITY DEFINER functions, so they use the default search_path
-- which already includes extensions. Just a sanity check.
