-- NUMBER9 — Platform Payment Accounts
-- Rekening bank dan metode pembayaran milik platform untuk deposit/withdrawal

CREATE TABLE IF NOT EXISTS platform_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name    VARCHAR(100) NOT NULL,
  account_holder   VARCHAR(100) NOT NULL,
  account_number   VARCHAR(50)  NOT NULL,
  payment_code     VARCHAR(100),
  type             VARCHAR(20)  NOT NULL DEFAULT 'BANK',  -- BANK | EWALLET | QRIS
  status           VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  instructions     TEXT,
  created_at       TIMESTAMP    DEFAULT NOW(),
  updated_at       TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_accounts_status ON platform_accounts(status);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_type   ON platform_accounts(type);

GRANT SELECT, INSERT, UPDATE, DELETE ON platform_accounts TO anon, authenticated, service_role;

-- Demo data
INSERT INTO platform_accounts (provider_name, account_holder, account_number, type, status, instructions)
VALUES
  ('Bank Central Asia', 'PT NUMBER NINE', '1234567890', 'BANK',    'ACTIVE',   'Transfer ke rekening BCA ini, lalu upload bukti transfer.'),
  ('Bank Mandiri',      'PT NUMBER NINE', '0987654321', 'BANK',    'ACTIVE',   'Transfer ke rekening Mandiri ini, lalu upload bukti transfer.'),
  ('GoPay',            'NUMBER9 Official', '081234567890', 'EWALLET', 'ACTIVE', 'Transfer via GoPay ke nomor ini, sertakan nama pengirim.'),
  ('QRIS',             'PT NUMBER NINE', 'N9-QRIS-001',  'QRIS',   'INACTIVE', 'Scan QR Code untuk pembayaran langsung.');
