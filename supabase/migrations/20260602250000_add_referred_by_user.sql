-- Track user-to-user referrals separately from the signup-code link.
--
-- users.referred_by  = referrals.id  (WHICH admin/platform code was used) — Angular's model, unchanged.
-- users.referred_by_user = users.id  (WHO referred this user) — needed for the React "My Network" downline.
--
-- The personal-code signup path records the referring user here; the admin/platform-code
-- path records the code's creator (NULL for platform codes with no human owner).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referred_by_user UUID REFERENCES public.users(id);

-- Backfill the known case: signups via an admin/user-generated code whose creator we know.
-- (Historic personal-code signups can't be backfilled — the link was never stored.)
UPDATE public.users u
   SET referred_by_user = r.created_by
  FROM public.referrals r
 WHERE u.referred_by = r.id
   AND r.created_by IS NOT NULL
   AND u.referred_by_user IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_referred_by_user ON public.users(referred_by_user);
