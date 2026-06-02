-- Remove fake/test user "aji" (arapah) and all related data
-- User ID: a0000000-0000-0000-0000-000000000002
-- Real admin (hemo): a0000000-0000-0000-0000-000000000001

SET session_replication_role = replica;

UPDATE public.audit_log
SET admin_id = 'a0000000-0000-0000-0000-000000000001'
WHERE admin_id = 'a0000000-0000-0000-0000-000000000002';

DELETE FROM public.bets         WHERE user_id = 'a0000000-0000-0000-0000-000000000002';
DELETE FROM public.sessions     WHERE user_id = 'a0000000-0000-0000-0000-000000000002';
DELETE FROM public.kyc_documents WHERE user_id = 'a0000000-0000-0000-0000-000000000002';
DELETE FROM public.wallet       WHERE user_id = 'a0000000-0000-0000-0000-000000000002';
DELETE FROM public.transactions WHERE user_id = 'a0000000-0000-0000-0000-000000000002';
DELETE FROM public.audit_log    WHERE resource_id = 'a0000000-0000-0000-0000-000000000002';
DELETE FROM public.users        WHERE id = 'a0000000-0000-0000-0000-000000000002';

SET session_replication_role = origin;
