-- Check realtime status
CREATE OR REPLACE FUNCTION check_realtime_status()
RETURNS TABLE (
  extname TEXT,
  extversion TEXT,
  pubname TEXT,
  tables_in_pub TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.extname::TEXT,
    e.extversion::TEXT,
    p.pubname::TEXT,
    STRING_AGG(pt.tablename::TEXT, ', ')::TEXT
  FROM pg_extension e
  LEFT JOIN pg_publication p ON p.pubname = 'supabase_realtime'
  LEFT JOIN pg_publication_tables pt ON pt.pubname = p.pubname
  WHERE e.extname LIKE '%realtime%'
  GROUP BY e.extname, e.extversion, p.pubname;
END;
$$;

GRANT EXECUTE ON FUNCTION check_realtime_status() TO anon, authenticated, service_role;
