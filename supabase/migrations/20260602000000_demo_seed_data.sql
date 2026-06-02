-- NUMBER9 — Demo seed data
-- Populates bank details, login sessions, audit log, and KYC for demo users
-- so the admin panel expand panels show realistic data.

-- ── Bank details ─────────────────────────────────────────────────────────────

UPDATE users SET
  bank_name            = 'Bank Central Asia',
  bank_account_number  = '1234567890',
  bank_account_name    = 'Arapah'
WHERE username = 'aji';

UPDATE users SET
  bank_name            = 'Bank Mandiri',
  bank_account_number  = '0987654321',
  bank_account_name    = 'Demo User'
WHERE username = 'demo';

-- ── Login sessions — aji ─────────────────────────────────────────────────────

INSERT INTO sessions (id, user_id, ip_address, browser_info, created_at, last_activity, expires_at, logged_out_at)
VALUES
  (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000002',
    '192.168.1.10',
    'Chrome 124 / Windows 10',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days' + INTERVAL '45 minutes',
    NOW() + INTERVAL '27 days',
    NOW() - INTERVAL '3 days' + INTERVAL '45 minutes'
  ),
  (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000002',
    '192.168.1.10',
    'Chrome 124 / Windows 10',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day' + INTERVAL '2 hours',
    NOW() + INTERVAL '29 days',
    NOW() - INTERVAL '1 day' + INTERVAL '2 hours'
  ),
  (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000002',
    '10.0.0.5',
    'Safari / iPhone iOS 17',
    NOW() - INTERVAL '4 hours',
    NOW() - INTERVAL '10 minutes',
    NOW() + INTERVAL '30 days',
    NULL
  );

-- ── Login sessions — demo ────────────────────────────────────────────────────

INSERT INTO sessions (id, user_id, ip_address, browser_info, created_at, last_activity, expires_at, logged_out_at)
VALUES
  (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000003',
    '203.0.113.42',
    'Firefox 125 / Ubuntu 22',
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '30 minutes',
    NOW() + INTERVAL '30 days',
    NULL
  ),
  (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000003',
    '203.0.113.42',
    'Firefox 125 / Ubuntu 22',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days' + INTERVAL '1 hour',
    NOW() + INTERVAL '28 days',
    NOW() - INTERVAL '2 days' + INTERVAL '1 hour'
  );

-- ── Audit log entries — actions on aji ───────────────────────────────────────

INSERT INTO audit_log (id, admin_id, action, resource_type, resource_id, old_value, new_value, created_at)
VALUES
  (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000001',
    'APPROVE_USER',
    'users',
    'a0000000-0000-0000-0000-000000000002',
    'PENDING',
    'APPROVED',
    NOW() - INTERVAL '4 days'
  ),
  (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000001',
    'APPROVE_KYC',
    'kyc_documents',
    'a0000000-0000-0000-0000-000000000002',
    'PENDING',
    'APPROVED',
    NOW() - INTERVAL '4 days' + INTERVAL '5 minutes'
  ),
  (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000001',
    'UPDATE_USER',
    'users',
    'a0000000-0000-0000-0000-000000000002',
    '{"role":"user"}',
    '{"role":"user"}',
    NOW() - INTERVAL '2 days'
  );

-- ── Audit log entries — actions on demo ──────────────────────────────────────

INSERT INTO audit_log (id, admin_id, action, resource_type, resource_id, old_value, new_value, created_at)
VALUES
  (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000001',
    'APPROVE_USER',
    'users',
    'a0000000-0000-0000-0000-000000000003',
    'PENDING',
    'APPROVED',
    NOW() - INTERVAL '5 days'
  ),
  (
    gen_random_uuid(),
    'a0000000-0000-0000-0000-000000000001',
    'UNLOCK_USER',
    'users',
    'a0000000-0000-0000-0000-000000000003',
    'LOCKED',
    'ACTIVE',
    NOW() - INTERVAL '3 days'
  );
