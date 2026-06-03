-- =============================================================================
-- ENABLE REALTIME for all tables
-- Supabase realtime uses publication, not PostgreSQL extension
-- =============================================================================

-- Create realtime publication if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
  END IF;
END $$;

-- Add all tables to realtime publication
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN 
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT IN ('schema_migrations', 'schema_version')
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl.tablename);
    EXCEPTION WHEN duplicate_object THEN
      -- Table already in publication, ignore
      NULL;
    END;
  END LOOP;
END $$;

-- Verify
SELECT COUNT(*) as table_count 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';
