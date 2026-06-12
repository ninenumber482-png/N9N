-- Lock admin-only RPCs that were granted to anon with NO internal authorization.
--
-- These SECURITY DEFINER functions return/modify admin data (KYC PII, IP whitelist)
-- and had `GRANT ... TO anon`, so anyone holding the public anon key could call them
-- directly (bypassing the admin-proxy + MFA): dump all KYC documents, or delete
-- whitelist entries. The admin app reaches them via admin-proxy (service_role); the
-- React user app and the gateway do NOT call them (verified), so revoking anon is safe.
--
-- NOT touched here (the gateway uses these via anon — handled separately):
--   add_allowed_ip, is_ip_allowed
-- NOT touched (user-facing): get_kyc_documents_by_user, get_my_*, place_bet, submit_*

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_kyc_documents_admin',
        'get_kyc_documents_admin_list',
        'get_kyc_document_by_id',
        'get_kyc_document_url',
        'count_kyc_by_status',
        'remove_allowed_ip',
        'get_allowed_ips'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    RAISE NOTICE 'locked %', r.sig;
  END LOOP;
END $$;
