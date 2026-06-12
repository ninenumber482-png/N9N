-- Admin TOTP 2FA (Google Authenticator) + backup codes + session MFA gate

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret text,
  ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS totp_backup_codes jsonb;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS mfa_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS sessions_mfa_pending_idx
  ON sessions (user_id, mfa_verified_at)
  WHERE logged_out_at IS NULL;

COMMENT ON COLUMN users.totp_secret IS 'Base32 TOTP secret (stored after setup, before enable on confirm)';
COMMENT ON COLUMN users.totp_backup_codes IS 'JSON array of SHA-256 hashes of one-time backup codes';
COMMENT ON COLUMN sessions.mfa_verified_at IS 'Set after TOTP/backup verify or skip on login';
