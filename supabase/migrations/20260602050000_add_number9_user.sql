-- Add number9 to users table so auth-login can create sessions for admin-proxy validation
INSERT INTO users (
  id,
  username,
  password_hash,
  display_name,
  email,
  phone,
  country,
  role,
  account_status,
  registration_status,
  login_status,
  referral_code,
  created_at,
  approved_at
) VALUES (
  'a0000000-0000-0000-0000-000000000003',
  'number9',
  '$2b$12$9bfYtPyPPP.EdkFLh7ns8.KkpdZ9DZff0cjegYwN/6Fc.ww5c8wua',
  'Number9',
  'number9@number9.local',
  '',
  'Indonesia',
  'admin',
  'ACTIVE',
  'APPROVED',
  'ACTIVE',
  'N9-NUMBER9-ADMIN',
  NOW(),
  NOW()
)
ON CONFLICT (username) DO NOTHING;
