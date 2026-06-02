-- NUMBER9 Platform Referral Code
-- Create a platform-wide referral code for user registration

INSERT INTO referrals (code, created_by, status, max_uses, used_count)
VALUES ('N9PLATFORM', NULL, 'ACTIVE', NULL, 0)
ON CONFLICT (code) DO UPDATE SET status = 'ACTIVE', max_uses = NULL;
