-- ============================================================================
-- Sweep: revoke ALL anon/authenticated write privileges across public schema
--
-- APPLIED en prod 2026-06-13 (project dqsmpdetiqsqfnidekik).
--
-- Étend le verrou des écritures à TOUTES les tables (RLS off → anon avait un
-- CRUD complet partout). On garde SELECT (lecture client en direct, voir
-- Phase 2 pour la fermer via RLS/RPC). Seule écriture client directe légitime :
-- support_tickets.insert → ré-accordée explicitement.
--
-- Les écritures légitimes (place_bet, approve_*, settle_session, register, …)
-- passent par des RPC SECURITY DEFINER ou des Edge Functions en service_role,
-- donc non affectées.
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;

-- Restaurer la seule écriture client directe (formulaire de support React)
GRANT INSERT ON public.support_tickets TO anon;
