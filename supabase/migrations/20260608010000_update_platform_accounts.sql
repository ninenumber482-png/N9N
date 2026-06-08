-- Update platform accounts with real account details
-- Update existing accounts or insert new ones

-- Clear existing demo data
DELETE FROM platform_accounts;

-- Insert real platform accounts
INSERT INTO platform_accounts (provider_name, account_holder, account_number, type, status, instructions)
VALUES
  ('Bank Central Asia', 'NATASYA OLIVIA', '1700827051', 'BANK', 'ACTIVE', 'Transfer ke rekening BCA ini, lalu upload bukti transfer.'),
  ('QRIS', 'PT NUMBER NINE', 'N9-QRIS-001', 'QRIS', 'ACTIVE', 'Scan QR Code untuk pembayaran langsung.');
