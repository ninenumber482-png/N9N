-- Seed test users for both admin and member login
-- Password: test123456 (bcrypt)
-- Hash: $2a$10$VxZMXlR.vJVSZHCWF/8/Fe8Q3.HuH4kBf4qKzZPakCPKJqnMjK7oK

INSERT INTO public.users (
  id, username, email, phone, display_name, password_hash, 
  kyc_status, account_status, registration_status, login_status, role,
  country, created_at
) VALUES (
  gen_random_uuid(),
  'admin',
  'admin@mynumber9.uk',
  '+628123456789',
  'Admin',
  '$2a$10$VxZMXlR.vJVSZHCWF/8/Fe8Q3.HuH4kBf4qKzZPakCPKJqnMjK7oK',
  'VERIFIED',
  'ACTIVE',
  'APPROVED',
  'ACTIVE',
  'admin',
  'ID',
  NOW()
) ON CONFLICT (username) DO UPDATE SET 
  registration_status = 'APPROVED',
  login_status = 'ACTIVE',
  account_status = 'ACTIVE',
  password_hash = '$2a$10$VxZMXlR.vJVSZHCWF/8/Fe8Q3.HuH4kBf4qKzZPakCPKJqnMjK7oK';

INSERT INTO public.users (
  id, username, email, phone, display_name, password_hash,
  kyc_status, account_status, registration_status, login_status, role,
  country, created_at
) VALUES (
  gen_random_uuid(),
  'member',
  'member@mynumber9.uk',
  '+6287654321',
  'Member',
  '$2a$10$VxZMXlR.vJVSZHCWF/8/Fe8Q3.HuH4kBf4qKzZPakCPKJqnMjK7oK',
  'VERIFIED',
  'ACTIVE',
  'APPROVED',
  'ACTIVE',
  'member',
  'ID',
  NOW()
) ON CONFLICT (username) DO UPDATE SET
  registration_status = 'APPROVED',
  login_status = 'ACTIVE',
  account_status = 'ACTIVE',
  password_hash = '$2a$10$VxZMXlR.vJVSZHCWF/8/Fe8Q3.HuH4kBf4qKzZPakCPKJqnMjK7oK';
