-- ============================================================================
-- ROLLBACK Phase 2 T3 — re-grant anon/authenticated SELECT (member tables)
--
-- APPLIED en prod 2026-06-13. Le passage des reads aux RPC (T2) a cassé
-- l'affichage du solde côté user en prod (get_my_wallet renvoyait vide/erreur
-- pour les vrais users → solde affiché à 0). T2 (React) a été reverté et le
-- SELECT anon ré-accordé pour restaurer le service.
--
-- Les RPC get_my_* (T1, migration 050000) restent en place (inoffensives,
-- inutilisées). Phase 2 à re-tenter après diagnostic propre (cache PostgREST /
-- résolution du token réel) — NE PAS re-révoquer SELECT sans test live complet.
-- ============================================================================

GRANT SELECT ON TABLE public.users, public.wallet, public.transactions, public.bets
  TO anon, authenticated;
