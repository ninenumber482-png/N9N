-- ============================================================
-- HOURLY MAINTENANCE JOB — NUMBER9 Platform
-- Jalankan sekali di Supabase SQL Editor
-- Setelah itu pg_cron akan otomatis eksekusi setiap jam tepat :00
-- ============================================================

-- 1. Fungsi maintenance utama
CREATE OR REPLACE FUNCTION public.hourly_maintenance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_sessions_deleted  INTEGER;
  v_logins_deleted    INTEGER;
  v_heartbeats_purged INTEGER;
BEGIN
  -- Hapus sessions yang sudah expired
  DELETE FROM sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS v_sessions_deleted = ROW_COUNT;

  -- Hapus failed_logins lebih dari 24 jam (reset rate limit harian)
  DELETE FROM failed_logins WHERE attempted_at < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_logins_deleted = ROW_COUNT;

  -- Simpan 1 session terbaru per user, hapus duplikat lama
  DELETE FROM sessions
  WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM sessions
    WHERE expires_at > NOW()
    ORDER BY user_id, last_activity DESC
  );

  -- Log ke audit
  INSERT INTO audit_log (action, details, created_at)
  VALUES (
    'HOURLY_MAINTENANCE',
    jsonb_build_object(
      'sessions_deleted', v_sessions_deleted,
      'failed_logins_cleared', v_logins_deleted,
      'executed_at', NOW()
    ),
    NOW()
  ) ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  -- Jangan crash engine jika audit gagal
  RAISE WARNING 'hourly_maintenance error: %', SQLERRM;
END;
$$;

-- 2. Daftarkan ke pg_cron — setiap jam tepat :00
-- (idempotent: cron.schedule akan update jika job sudah ada)
SELECT cron.unschedule('hourly-maintenance') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'hourly-maintenance'
);

SELECT cron.schedule(
  'hourly-maintenance',   -- nama job
  '0 * * * *',            -- setiap jam tepat :00
  'SELECT public.hourly_maintenance();'
);

-- 3. Verifikasi terdaftar
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname IN ('hourly-maintenance', 'king-engine-tick', 'prune-rate-limits', 'snapshot-pending-counts')
ORDER BY jobname;
