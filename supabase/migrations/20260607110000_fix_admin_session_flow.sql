-- Fix admin session: ensure admin from n9_users exists in users table
-- (sessions.user_id has FK → users.id, so auth-login can insert sessions for admin)

INSERT INTO users (id, username, display_name, role, account_status, login_status, registration_status, password_hash)
SELECT
  n.id,
  n.username,
  COALESCE(n.full_name, n.username),
  'admin',
  'ACTIVE',
  'ACTIVE',
  'APPROVED',
  n.password_hash
FROM n9_users n
WHERE n.role = 'admin'
ON CONFLICT (id) DO UPDATE
  SET account_status = 'ACTIVE',
      login_status   = 'ACTIVE',
      registration_status = 'APPROVED',
      role = 'admin';

-- Make sure any existing admin rows in users are also ACTIVE
UPDATE users
SET account_status = 'ACTIVE',
    registration_status = 'APPROVED'
WHERE role = 'admin'
  AND account_status != 'ACTIVE';
