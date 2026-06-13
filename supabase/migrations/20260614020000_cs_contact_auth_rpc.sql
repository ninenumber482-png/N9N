-- ============================================================================
-- CS Contact: Telegram + WhatsApp, login-only (backend-gated)
--
-- STATUS: NOT YET APPLIED to production — review then apply manually.
--
-- TUJUAN:
--   1. Widget CS hanya boleh untuk user yang SUDAH LOGIN. Sebelumnya link CS
--      (cs_wa_number, dll) ada di get_public_config() yang anon-readable → anon
--      bisa baca nomor WA via API publik walau widget disembunyikan.
--   2. Dukung 2 channel: Telegram + WhatsApp, masing-masing ON/OFF + link sendiri.
--
-- DESAIN:
--   - RPC get_cs_contact() (SECURITY DEFINER) butuh sesi user valid (x-user-token
--     → get_user_id()). Anon tanpa token → {'error':'NO_SESSION'}, tidak ada link.
--   - cs_* keys DIKELUARKAN dari get_public_config() (anon hanya boleh maintenance_*).
--   - Key baru: cs_wa_active, cs_telegram_active, cs_telegram_link.
--     cs_wa_active di-seed dari nilai cs_active lama (preserve perilaku WA on).
--
-- Caller frontend: NUMBER9/src/utils/csContact.js (RPC, x-user-token otomatis).
-- Admin set value lewat admin-proxy (service_role) seperti config lain.
-- ============================================================================

-- ── Key baru (idempotent) ───────────────────────────────────────────────────
INSERT INTO platform_config (key, value)
SELECT 'cs_wa_active', COALESCE((SELECT value FROM platform_config WHERE key = 'cs_active'), 'false')
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_config (key, value) VALUES
  ('cs_telegram_active', 'false'),
  ('cs_telegram_link', '')
ON CONFLICT (key) DO NOTHING;

-- ── RPC ber-auth: balikin config CS HANYA untuk user login ───────────────────
CREATE OR REPLACE FUNCTION public.get_cs_contact()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid uuid;
  v jsonb;
BEGIN
  -- Wajib sesi user valid (x-user-token). Anon/expired → NO_SESSION, tanpa link.
  v_uid := get_user_id();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'NO_SESSION');
  END IF;

  SELECT jsonb_object_agg(key, value) INTO v
  FROM platform_config
  WHERE key IN (
    'cs_active', 'cs_display_name', 'cs_welcome_message', 'cs_avatar_url',
    'cs_wa_active', 'cs_wa_number',
    'cs_telegram_active', 'cs_telegram_link'
  );

  RETURN COALESCE(v, '{}'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.get_cs_contact() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_cs_contact() TO anon, authenticated, service_role;

-- ── get_public_config(): keluarkan semua cs_* (anon hanya maintenance) ───────
CREATE OR REPLACE FUNCTION get_public_config()
RETURNS TABLE (key text, value text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pc.key, pc.value
  FROM platform_config pc
  WHERE pc.key IN ('maintenance_mode', 'maintenance_msg');
$$;

REVOKE EXECUTE ON FUNCTION get_public_config() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_public_config() TO anon, authenticated, service_role;

-- ── Rollback (kalau perlu) ───────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.get_cs_contact();
-- dan kembalikan cs_* ke get_public_config() (lihat 20260612120000_lock_platform_config.sql).
