-- Fix inconsistent user status: DEACTIVATED → ACTIVE for approved users
-- These users have registration_status = 'APPROVED' but account_status = 'DEACTIVATED'
-- which prevents verification checkmarks and shows wrong status on profile

UPDATE users
SET account_status = 'ACTIVE'
WHERE registration_status = 'APPROVED'
  AND account_status = 'DEACTIVATED';
