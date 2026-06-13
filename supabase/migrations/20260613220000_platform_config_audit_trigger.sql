-- AUDIT TRAIL: setiap perubahan maintenance_mode dan king_marketplace dicatat ke audit_log
-- Trigger ini memastikan setiap toggle platform config meninggalkan jejak permanen
-- dengan old_value dan new_value, timestamp, dan resource identifier.

CREATE OR REPLACE FUNCTION log_platform_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Hanya audit key yang kritis untuk keamanan platform
  IF NEW.key IN ('maintenance_mode', 'king_marketplace', 'king_marketplace_msg', 'maintenance_msg') THEN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
      INSERT INTO audit_log (
        action,
        resource_type,
        resource_id,
        old_value,
        new_value,
        created_at
      ) VALUES (
        CASE NEW.key
          WHEN 'maintenance_mode'  THEN
            CASE NEW.value WHEN 'true' THEN 'MAINTENANCE_ENABLED' ELSE 'MAINTENANCE_DISABLED' END
          WHEN 'king_marketplace'  THEN
            CASE NEW.value WHEN 'OPEN' THEN 'MARKETPLACE_OPENED' ELSE 'MARKETPLACE_CLOSED' END
          ELSE 'PLATFORM_CONFIG_CHANGE'
        END,
        'platform_config',
        NEW.key,
        OLD.value,
        NEW.value,
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

-- INSERT juga perlu diaudit (pertama kali key dibuat)
CREATE OR REPLACE FUNCTION log_platform_config_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.key IN ('maintenance_mode', 'king_marketplace') THEN
    INSERT INTO audit_log (action, resource_type, resource_id, new_value, created_at)
    VALUES ('PLATFORM_CONFIG_SET', 'platform_config', NEW.key, NEW.value, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_config_insert_audit ON platform_config;
CREATE TRIGGER platform_config_insert_audit
  AFTER INSERT ON platform_config
  FOR EACH ROW
  EXECUTE FUNCTION log_platform_config_insert();
