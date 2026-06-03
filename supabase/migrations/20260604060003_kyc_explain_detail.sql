CREATE OR REPLACE FUNCTION explain_kyc_detail()
RETURNS TABLE (line TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT, VERBOSE)
  SELECT k.*, u.username, u.display_name
  FROM kyc_documents k
  LEFT JOIN users u ON k.user_id = u.id
  ORDER BY k.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION explain_kyc_detail() TO anon, authenticated, service_role;
