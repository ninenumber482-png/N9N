-- Backfill missing referral_codes for existing users
-- Two admin accounts were created before the auto-generate logic was in place

UPDATE users SET referral_code = 'N9-ADMIN-F6GJL' WHERE id = '1b8c2182-4557-4ef6-83f9-23f3c74dbf8f' AND referral_code IS NULL;
UPDATE users SET referral_code = 'N9-SYSTEM-ZWNF'  WHERE id = '00000000-0000-0000-0000-000000000000' AND referral_code IS NULL;
