-- =============================================================================
-- RPC: Get EXPLAIN plan for KYC queries (for diagnostics)
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION explain_kyc_query()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
  SELECT k.*, u.username, u.display_name
  FROM kyc_documents k
  LEFT JOIN users u ON k.user_id = u.id
  ORDER BY k.created_at DESC
  INTO v_plan;
  
  RETURN v_plan;
EXCEPTION WHEN OTHERS THEN
  RETURN 'Error: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION explain_kyc_query() TO anon, authenticated, service_role;

COMMIT;
