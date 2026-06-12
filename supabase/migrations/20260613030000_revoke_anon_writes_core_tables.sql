-- ============================================================================
-- Revoke anon/authenticated WRITE privileges on core member tables (keep SELECT)
--
-- APPLIED en prod 2026-06-13 (project dqsmpdetiqsqfnidekik).
--
-- PROBLÈME (critique, pré-existant) :
--   RLS off + grants Supabase par défaut → anon (clé publique, bundlée au front)
--   avait INSERT/UPDATE/DELETE/TRUNCATE sur les tables membres. N'importe quel
--   visiteur pouvait modifier des soldes, supprimer des comptes, ou TRUNCATE des
--   tables entières via /rest/v1/<table>.
--
-- CONTRAINTE : l'app React (clé anon) LIT directement ces tables (.select) et
--   doit continuer à le faire. Donc on garde SELECT, on révoque seulement les
--   écritures. Les écritures légitimes passent par des RPC/Edge (service_role).
--   Seule écriture client directe : support_tickets.insert (conservée).
--
-- Vérifié dans NUMBER9/src : users/wallet/transactions/platform_accounts/
--   king_results/bets = .select uniquement ; support_tickets = .insert.
--
-- RESTE À FAIRE (séparé, plus gros) : l'exposition en LECTURE (anon peut lire
--   TOUTES les lignes de tous les membres) nécessite RLS ou un passage par RPC.
-- ============================================================================

-- Tables lues seulement par le client → révoquer toutes les écritures, garder SELECT
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.users, public.wallet, public.transactions,
           public.platform_accounts, public.king_results, public.bets
  FROM anon, authenticated;

-- support_tickets : le client insère des tickets → garder SELECT + INSERT
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.support_tickets
  FROM anon, authenticated;
