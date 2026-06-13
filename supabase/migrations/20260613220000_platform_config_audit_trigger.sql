-- AUDIT TRAIL: setiap perubahan maintenance_mode dan king_marketplace dicatat ke audit_log
-- admin_id NOT NULL → pakai admin pertama di tabel users sebagai aktor sistem.
-- reason = config key (maintenance_mode / king_marketplace)

CREATE OR REPLACE FUNCTION log_platform_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  IF NEW.key IN ('maintenance_mode', 'king_marketplace', 'king_marketplace_msg', 'maintenance_msg') THEN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
      SELECT id INTO v_admin_id FROM users WHERE role IN ('admin','superadmin') ORDER BY created_at LIMIT 1;
      INSERT INTO audit_log (
        admin_id, action, resource_type, resource_id,
        old_value, new_value, reason, created_at
      ) VALUES (
        v_admin_id,
        CASE NEW.key
          WHEN 'maintenance_mode' THEN
            CASE NEW.value WHEN 'true' THEN 'MAINTENANCE_ENABLED' ELSE 'MAINTENANCE_DISABLED' END
          WHEN 'king_marketplace' THEN
            CASE NEW.value WHEN 'OPEN' THEN 'MARKETPLACE_OPENED' ELSE 'MARKETPLACE_CLOSED' END
          ELSE 'PLATFORM_CONFIG_CHANGE'
        END,
        'platform_config',
        NULL,
        OLD.value,
        NEW.value,
        NEW.key,
        NOW()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_config_audit ON platform_config;
CREATE TRIGGER platform_config_audit
  AFTER UPDATE ON platform_config
  FOR EACH ROW
  EXECUTE FUNCTION log_platform_config_change();

CREATE OR REPLACE FUNCTION log_platform_config_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  IF NEW.key IN ('maintenance_mode', 'king_marketplace') THEN
    SELECT id INTO v_admin_id FROM users WHERE role IN ('admin','superadmin') ORDER BY created_at LIMIT 1;
    INSERT INTO audit_log (admin_id, action, resource_type, resource_id, new_value, reason, created_at)
    VALUES (v_admin_id, 'PLATFORM_CONFIG_SET', 'platform_config', NULL, NEW.value, NEW.key, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_config_insert_audit ON platform_config;
CREATE TRIGGER platform_config_insert_audit
  AFTER INSERT ON platform_config
  FOR EACH ROW
  EXECUTE FUNCTION log_platform_config_insert();
