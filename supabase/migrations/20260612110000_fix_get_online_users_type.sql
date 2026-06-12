-- ============================================================================
-- Fix get_online_users() — type mismatch + kunci eksposur data
--
-- ⚠️ DRAFT: BELUM di-apply ke produksi. Jalankan via `supabase db push --linked`
--    (atau SQL Editor Supabase) HANYA saat Anda siap. Tidak ada perubahan live
--    yang dilakukan otomatis.
--
-- BUG (PostgREST error 42804):
--   RETURNS TABLE mendeklarasikan `ip_address TEXT`, tapi kolom asli
--   `sessions.ip_address` bertipe VARCHAR(50) → "Returned type character
--   varying(50) does not match expected type text in column 3".
-- FIX: cast `s.ip_address::text` agar cocok dengan signature fungsi.
--
-- KEAMANAN (penting):
--   Fungsi ini mengembalikan IP + device fingerprint SEMUA user yang online.
--   Sebelumnya tidak ada GRANT eksplisit → default PUBLIC (anon bisa panggil).
--   Anon key bersifat publik (ikut ter-bundle ke frontend), jadi kalau fungsi
--   hanya diperbaiki tanpa dikunci, siapa pun bisa dump data sensitif ini.
--   → REVOKE dari PUBLIC/anon, hanya beri ke service_role.
--   Admin panel harus memanggilnya lewat admin-proxy (service_role), BUKAN anon.
--   (Kalau Anda sengaja mau akses anon, hapus 2 baris REVOKE/GRANT di bawah.)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_online_users()
RETURNS TABLE (
  user_id       UUID,
  last_activity TIMESTAMP,
  ip_address    TEXT,
  device_info   JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (s.user_id)
    s.user_id,
    s.last_activity,
    s.ip_address::text,          -- cast VARCHAR(50) -> TEXT (fix 42804)
    s.device_info
  FROM sessions s
  WHERE s.logged_out_at IS NULL
    AND s.last_activity > NOW() - INTERVAL '5 minutes'
  ORDER BY s.user_id, s.last_activity DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Kunci akses: data IP+fingerprint hanya boleh lewat service_role (admin-proxy)
REVOKE EXECUTE ON FUNCTION get_online_users() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_online_users() FROM anon;
GRANT  EXECUTE ON FUNCTION get_online_users() TO service_role;
