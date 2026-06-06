CREATE TABLE IF NOT EXISTS gateway_whitelist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  label      text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gateway_whitelist_ip ON gateway_whitelist (ip_address);

ALTER TABLE gateway_whitelist ENABLE ROW LEVEL SECURITY;

-- anon can read via RPC only
CREATE POLICY "service_role_full_access" ON gateway_whitelist
  FOR ALL TO service_role USING (true);

-- ── RPC: list all whitelisted IPs ──

CREATE OR REPLACE FUNCTION get_allowed_ips()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_agg(json_build_object('id', id, 'ip_address', ip_address, 'label', label, 'created_at', created_at))
  INTO v_result
  FROM gateway_whitelist
  ORDER BY created_at DESC;
  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION get_allowed_ips() TO anon;

-- ── RPC: add IP ──

CREATE OR REPLACE FUNCTION add_allowed_ip(p_ip text, p_label text DEFAULT '', p_admin_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row gateway_whitelist;
BEGIN
  INSERT INTO gateway_whitelist (ip_address, label, created_by)
  VALUES (p_ip, p_label, p_admin_id)
  RETURNING * INTO v_row;
  RETURN json_build_object('id', v_row.id, 'ip_address', v_row.ip_address, 'label', v_row.label);
END;
$$;

GRANT EXECUTE ON FUNCTION add_allowed_ip(text, text, uuid) TO anon;

-- ── RPC: remove IP ──

CREATE OR REPLACE FUNCTION remove_allowed_ip(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM gateway_whitelist WHERE id = p_id;
  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION remove_allowed_ip(uuid) TO anon;

-- ── RPC: check if IP is allowed ──

CREATE OR REPLACE FUNCTION is_ip_allowed(p_ip text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM gateway_whitelist WHERE ip_address = p_ip);
END;
$$;

GRANT EXECUTE ON FUNCTION is_ip_allowed(text) TO anon;
