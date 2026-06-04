-- Migration: Add device fingerprint support + online status tracking
-- The device_info JSONB column already exists in sessions table,
-- but we need to ensure the heartbeat RPC works properly.

-- Add index for faster online status queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON sessions(user_id, last_activity DESC)
  WHERE logged_out_at IS NULL;

-- Function to update session heartbeat (called by React app)
CREATE OR REPLACE FUNCTION update_session_heartbeat(
  p_user_id UUID,
  p_fingerprint TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE sessions
  SET
    last_activity = NOW(),
    device_info = CASE
      WHEN p_fingerprint IS NOT NULL THEN jsonb_build_object('fingerprint', p_fingerprint)
      ELSE device_info
    END
  WHERE user_id = p_user_id
    AND logged_out_at IS NULL
    AND (last_activity IS NULL OR last_activity < NOW() - INTERVAL '10 seconds');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC wrapper for heartbeat
CREATE OR REPLACE FUNCTION session_heartbeat(p_fingerprint TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_session_token TEXT;
BEGIN
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RETURN; END IF;

  SELECT id INTO v_user_id FROM users
    WHERE session_token = v_session_token AND session_expires_at > NOW();
  IF v_user_id IS NULL THEN RETURN; END IF;

  PERFORM update_session_heartbeat(v_user_id, p_fingerprint);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get online users (admin use)
CREATE OR REPLACE FUNCTION get_online_users()
RETURNS TABLE (
  user_id UUID,
  last_activity TIMESTAMP,
  ip_address TEXT,
  device_info JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (s.user_id)
    s.user_id,
    s.last_activity,
    s.ip_address,
    s.device_info
  FROM sessions s
  WHERE s.logged_out_at IS NULL
    AND s.last_activity > NOW() - INTERVAL '5 minutes'
  ORDER BY s.user_id, s.last_activity DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
