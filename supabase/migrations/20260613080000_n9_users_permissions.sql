-- Per-page access limits for admin accounts (NULL/empty = full access).
-- Configuré par hemo (superadmin) via Role Management. Additif/nullable :
-- aucun changement de comportement tant qu'aucune limite n'est fixée.
ALTER TABLE public.n9_users ADD COLUMN IF NOT EXISTS permissions text[];
