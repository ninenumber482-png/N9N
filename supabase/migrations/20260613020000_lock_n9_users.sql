-- ============================================================================
-- Lock down n9_users (admin registry) from anon/authenticated
--
-- APPLIED en prod 2026-06-13 (project dqsmpdetiqsqfnidekik) via
--   `supabase db query --linked`.
--
-- PROBLÈME (critique) :
--   RLS off + grants Supabase par défaut → anon & authenticated avaient
--   SELECT/INSERT/UPDATE/DELETE/TRUNCATE sur n9_users. La clé anon est publique
--   (bundlée au frontend), donc N'IMPORTE QUI pouvait LIRE les hash de mots de
--   passe admin (et les modifier/supprimer). Vérifié : `GET /rest/v1/n9_users`
--   en anon renvoyait les password_hash.
--
-- FIX :
--   REVOKE tout pour anon/authenticated. L'admin accède à n9_users uniquement
--   via service_role (auth-login + admin-proxy), donc le login admin n'est pas
--   affecté (vérifié : hemo se connecte toujours après le REVOKE).
--
-- NOTE (hors périmètre, à traiter séparément) : la table `users` (membres) a la
--   MÊME exposition (anon a un CRUD complet, `GET /rest/v1/users` renvoie 200).
--   À verrouiller après vérification que l'app React ne lit pas `users` en anon.
-- ============================================================================

REVOKE ALL PRIVILEGES ON TABLE public.n9_users FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.n9_users FROM authenticated;
-- postgres (owner) + service_role gardent l'accès complet.
