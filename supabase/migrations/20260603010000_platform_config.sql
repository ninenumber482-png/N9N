-- Platform configuration table for global settings (CS contact, etc.)
CREATE TABLE IF NOT EXISTS platform_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

-- Public read — anyone can read config values (used by user app for CS widget)
CREATE POLICY "platform_config_select_public"
  ON platform_config FOR SELECT
  USING (true);

-- Only admins via service_role can write (admin-proxy bypasses RLS)
CREATE POLICY "platform_config_insert_service"
  ON platform_config FOR INSERT
  WITH CHECK (true);

CREATE POLICY "platform_config_update_service"
  ON platform_config FOR UPDATE
  USING (true);

-- Insert default CS contact config
INSERT INTO platform_config (key, value) VALUES
  ('cs_wa_number', ''),
  ('cs_display_name', 'Customer Service'),
  ('cs_welcome_message', 'Hello, I need assistance.'),
  ('cs_active', 'false'),
  ('cs_avatar_url', '')
ON CONFLICT (key) DO NOTHING;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_platform_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_config_updated_at ON platform_config;
CREATE TRIGGER trg_platform_config_updated_at
  BEFORE UPDATE ON platform_config
  FOR EACH ROW EXECUTE FUNCTION trg_platform_config_updated_at();
