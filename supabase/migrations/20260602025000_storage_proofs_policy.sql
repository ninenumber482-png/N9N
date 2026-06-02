-- Allow anyone to upload to the proofs bucket (deposit evidence)
-- and allow public reads (admin panel can view proof images).

INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow anon/authenticated to upload
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='proofs_insert' AND tablename='objects' AND schemaname='storage') THEN
    CREATE POLICY "proofs_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'proofs');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='proofs_select' AND tablename='objects' AND schemaname='storage') THEN
    CREATE POLICY "proofs_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'proofs');
  END IF;
END $$;
