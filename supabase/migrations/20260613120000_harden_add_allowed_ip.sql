-- store the gateway whitelist key
INSERT INTO platform_config (key, value) VALUES ('whitelist_api_key', '<WHITELIST_API_KEY>')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- harden add_allowed_ip: service_role (admin via proxy) OR valid p_api_key (gateway)
DROP FUNCTION IF EXISTS add_allowed_ip(text, text, uuid);
CREATE OR REPLACE FUNCTION add_allowed_ip(
  p_ip text, p_label text DEFAULT '', p_admin_id uuid DEFAULT NULL, p_api_key text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row gateway_whitelist; v_role text; v_expected text;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  IF v_role <> 'service_role' THEN
    SELECT value INTO v_expected FROM platform_config WHERE key = 'whitelist_api_key';
    IF v_expected IS NULL OR p_api_key IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'WHITELIST_UNAUTHORIZED';
    END IF;
  END IF;
  INSERT INTO gateway_whitelist (ip_address, label, created_by)
  VALUES (p_ip, p_label, p_admin_id) RETURNING * INTO v_row;
  RETURN json_build_object('id', v_row.id, 'ip_address', v_row.ip_address, 'label', v_row.label);
END; $$;
REVOKE EXECUTE ON FUNCTION add_allowed_ip(text,text,uuid,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION add_allowed_ip(text,text,uuid,text) TO anon, service_role;
