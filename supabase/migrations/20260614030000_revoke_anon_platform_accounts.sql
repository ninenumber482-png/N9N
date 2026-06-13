-- ============================================================================
-- Sembunyikan data rekening bank dari frontend (platform_accounts)
--
-- STATUS: NOT YET APPLIED to production — review then apply manually.
--
-- MASALAH:
--   platform_accounts (provider_name, account_holder, account_number, ...) selama
--   ini anon-SELECT. Frontend baca langsung via .from('platform_accounts') dan
--   menampilkan nomor rekening + nama pemilik ke user di halaman deposit.
--   Brief keamanan: data rekening TIDAK boleh sampai ke frontend/HTML/JS/storage/
--   response API untuk user biasa maupun anon. Hanya admin/internal (service_role)
--   yang boleh.
--
-- FIX:
--   REVOKE SELECT dari anon + authenticated. service_role (admin-proxy) tetap
--   punya akses penuh untuk mengelola rekening di panel admin.
--
-- PRA-SYARAT (sudah dikerjakan di sisi frontend sebelum migrasi ini diapply):
--   - NUMBER9/src/store/wallet.js: fetchPlatformAccounts() dihapus.
--   - NUMBER9/src/App.jsx: polling + realtime subscription platform_accounts dihapus.
--   - NUMBER9/src/pages/WalletPage.jsx (DepositTab): panel rekening diganti
--     instruksi umum (tidak ada nomor rekening yang tampil).
--   → Setelah ini tidak ada jalur baca anon ke platform_accounts.
--
-- Rollback: GRANT SELECT ON platform_accounts TO anon, authenticated;
-- ============================================================================

REVOKE SELECT ON TABLE public.platform_accounts FROM anon, authenticated;

-- service_role tetap penuh (admin-proxy). RLS tetap off; akses murni role-based.
