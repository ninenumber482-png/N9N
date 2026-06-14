-- ============================================================================
-- Hardening: tutup kebocoran akses anon yang ketemu di audit 2026-06-14.
-- Aman di-apply SETELAH frontend baru live (semua jalur pakai RPC/admin-proxy).
-- Konsolidasi bagian "deferred" dari 020000/030000/070000 + temuan baru
-- (support_tickets SELECT bocor via policy blanket-true {public}).
-- ============================================================================

-- 1) support_tickets — BOCOR PALING PARAH: anon bisa dump semua tiket (PII)
--    karena grant SELECT ke anon + policy `..._select_admin USING(true)` utk {public}.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.support_tickets FROM anon, authenticated;
DROP POLICY IF EXISTS support_tickets_select_admin ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_update_admin ON public.support_tickets;
-- baca/tulis user lewat RPC (get_my_tickets/create_ticket/send_ticket_message),
-- admin lewat admin-proxy (service_role bypass RLS). policy _own dibiarkan (harmless tanpa grant).

-- 2) platform_accounts — nomor rekening bocor ke anon (REST langsung).
REVOKE SELECT ON public.platform_accounts FROM anon, authenticated;
-- user dapat rekening cuma via get_deposit_account (login-gated); admin via admin-proxy.

-- 3) get_public_config — buang cs_* (link CS) dari hasil; anon cuma boleh maintenance_*.
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
-- link CS sekarang cuma via get_cs_contact (login-gated).
