-- ============================================================================
-- Phase 2 T3 — Revoke anon/authenticated SELECT on per-user member tables
--
-- APPLIED en prod 2026-06-13. Les reads client passent désormais par les RPC
-- token-scopées (get_my_wallet/transactions/bets/referrals/profile) — un
-- visiteur ne peut plus lire les données d'un autre user.
--
-- Les RPC sont SECURITY DEFINER → non affectées par ce REVOKE.
-- king_results + platform_accounts restent lisibles (publics, non per-user).
-- Effet de bord accepté : les subscriptions realtime (transactions/bets/wallet)
-- peuvent ne plus s'autoriser → l'app retombe sur le polling 10s (App.jsx),
-- les données restent affichées (via RPC). Rollback = re-GRANT SELECT.
-- ============================================================================

REVOKE SELECT ON TABLE public.users, public.wallet, public.transactions, public.bets
  FROM anon, authenticated;
