-- Login geo tracking (React user sessions) + last login snapshot on users

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_ip varchar(50),
  ADD COLUMN IF NOT EXISTS last_login_geo jsonb;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS geo_info jsonb;

CREATE INDEX IF NOT EXISTS idx_sessions_geo_country
  ON sessions ((geo_info->>'country_code'))
  WHERE geo_info IS NOT NULL;

COMMENT ON COLUMN users.last_login_geo IS 'Latest login geo: city, region, country, country_code, isp';
COMMENT ON COLUMN sessions.geo_info IS 'GeoIP resolved at session creation from source IP';
