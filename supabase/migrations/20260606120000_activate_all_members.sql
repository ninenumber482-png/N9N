-- NUMBER9 — Activate all member accounts + generate referral codes
-- Ensures every user (role='user') has:
--   1. account_status = 'ACTIVE'
--   2. registration_status = 'APPROVED'
--   3. login_status = 'ACTIVE'
--   4. A unique referral_code if missing

-- Generate referral codes for users without one
UPDATE users
SET
  referral_code = 'N9-USER-' || upper(substr(md5(random()::text || id::text), 1, 5)),
  account_status = 'ACTIVE',
  registration_status = 'APPROVED',
  login_status = 'ACTIVE'
WHERE
  role = 'user'
  AND (referral_code IS NULL OR referral_code = ''
       OR account_status IS DISTINCT FROM 'ACTIVE'
       OR registration_status IS DISTINCT FROM 'APPROVED'
       OR login_status IS DISTINCT FROM 'ACTIVE');
