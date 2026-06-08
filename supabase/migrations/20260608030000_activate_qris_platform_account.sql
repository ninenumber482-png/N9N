-- Fix platform_accounts permissions and activate QRIS
-- Fix permissions for anon role
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_accounts TO anon, authenticated, service_role;

-- Update QRIS account to ACTIVE with correct account holder
UPDATE platform_accounts 
SET status = 'ACTIVE', 
    account_holder = 'PT NUMBER NINE',
    updated_at = NOW()
WHERE provider_name = 'QRIS';
