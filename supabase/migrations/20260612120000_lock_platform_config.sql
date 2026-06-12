-- ============================================================================
-- Lock down platform_config + expose only public-safe keys via RPC
--
-- APPLIED ke produksi 2026-06-12 (project dqsmpdetiqsqfnidekik), 2 fase:
--   Fase 1 (RPC + GRANT + REVOKE write) — sebelum redeploy React (zero-impact).
--   Fase 2 (REVOKE SELECT)              — sesudah React build baru live.
--
-- MASALAH (kritis):
--   RLS off + grant default Supabase → role `anon` & `authenticated` punya
--   INSERT/SELECT/UPDATE/DELETE/TRUNCATE penuh atas platform_config. Anon key
--   bersifat publik (ter-bundle ke frontend). Akibatnya siapa pun bisa:
--     - BACA semua config, termasuk `engine_api_key` (rahasia) → bocor.
--     - TULIS/HAPUS/TRUNCATE config (mis. toggle maintenance, ganti api key).
--   4 halaman publik React (Landing, Login, Support, CsWidget) cuma butuh
--   7 key non-sensitif (maintenance_* + cs_*).
--
-- FIX:
--   - RPC get_public_config() SECURITY DEFINER yang HANYA balikin 7 key publik.
--   - REVOKE semua privilege anon/authenticated atas tabel.
--   - Admin app baca/tulis lewat admin-proxy (service_role) → tak terdampak.
-- ============================================================================

-- ── RPC: hanya key publik-aman ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_public_config()
RETURNS TABLE (key text, value text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pc.key, pc.value
  FROM platform_config pc
  WHERE pc.key IN (
    'maintenance_mode', 'maintenance_msg',
    'cs_active', 'cs_wa_number', 'cs_welcome_message',
    'cs_display_name', 'cs_avatar_url'
  );
$$;

REVOKE EXECUTE ON FUNCTION get_public_config() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_public_config() TO anon, authenticated, service_role;

-- ── Kunci tabel: hanya service_role (admin-proxy) yang boleh menyentuh ───────
REVOKE ALL PRIVILEGES ON TABLE platform_config FROM anon;
REVOKE ALL PRIVILEGES ON TABLE platform_config FROM authenticated;
-- postgres (owner) + service_role tetap punya akses penuh.
