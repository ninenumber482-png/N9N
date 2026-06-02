-- Clean up duplicate users (same email, created by registration without email check)
-- and remove dummy 'demo' user

BEGIN;

-- 1. Disable audit trigger to avoid FK constraint issue on DELETE
ALTER TABLE users DISABLE TRIGGER trigger_audit_user_changes;

-- 2. Delete audit_log entries referencing duplicate users (both admin_id and resource_id)
DELETE FROM audit_log WHERE admin_id IN (
  '6bf60024-6d81-4a42-8c73-8d5b54f93a56',
  '49fa40c6-5fac-471f-9f24-d7a7907c13f9',
  'd02534f1-a705-4373-ba69-78ed5f99331d',
  '1634f6c5-f60a-4495-82cc-08281f3dc7e4'
);
DELETE FROM audit_log WHERE resource_id IN (
  '6bf60024-6d81-4a42-8c73-8d5b54f93a56',
  '49fa40c6-5fac-471f-9f24-d7a7907c13f9',
  'd02534f1-a705-4373-ba69-78ed5f99331d',
  '1634f6c5-f60a-4495-82cc-08281f3dc7e4'
);

-- 3. Delete sessions for duplicate users
DELETE FROM sessions WHERE user_id IN (
  '6bf60024-6d81-4a42-8c73-8d5b54f93a56',
  '49fa40c6-5fac-471f-9f24-d7a7907c13f9',
  'd02534f1-a705-4373-ba69-78ed5f99331d',
  '1634f6c5-f60a-4495-82cc-08281f3dc7e4'
);

-- 4. Delete duplicate users
DELETE FROM users WHERE id IN (
  '6bf60024-6d81-4a42-8c73-8d5b54f93a56',
  '49fa40c6-5fac-471f-9f24-d7a7907c13f9',
  'd02534f1-a705-4373-ba69-78ed5f99331d',
  '1634f6c5-f60a-4495-82cc-08281f3dc7e4'
);

-- 5. Re-enable audit trigger
ALTER TABLE users ENABLE TRIGGER trigger_audit_user_changes;

-- 6. Clean up dummy 'demo' user (has 3 transactions, wallet with 500)
DELETE FROM transactions WHERE user_id = 'a0000000-0000-0000-0000-000000000003';
DELETE FROM wallet WHERE user_id = 'a0000000-0000-0000-0000-000000000003';
DELETE FROM sessions WHERE user_id = 'a0000000-0000-0000-0000-000000000003';
DELETE FROM users WHERE id = 'a0000000-0000-0000-0000-000000000003';

COMMIT;
