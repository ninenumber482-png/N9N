CREATE OR REPLACE FUNCTION explain_kyc_with_rls()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
  SELECT * FROM kyc_documents ORDER BY created_at DESC
  INTO v_plan;
  RETURN v_plan;
EXCEPTION WHEN OTHERS THEN
  RETURN 'Error: ' || SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION explain_kyc_with_rls() TO anon, authenticated, service_role;
