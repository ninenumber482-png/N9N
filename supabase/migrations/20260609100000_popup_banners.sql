-- NUMBER9 — Popup banners table + admin RPCs
-- SECURITY DEFINER, service_role only (called via admin-proxy)

CREATE TABLE IF NOT EXISTS popup_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  image_path TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE popup_banners ENABLE ROW LEVEL SECURITY;

-- Anon can read active banners
CREATE POLICY "Anyone can read active banners"
  ON popup_banners FOR SELECT
  USING (active = true);

-- Service role full access
CREATE POLICY "Service role has full access"
  ON popup_banners
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 1. admin_delete_popup_banner — delete banner + storage file
-- =============================================================================
CREATE OR REPLACE FUNCTION admin_delete_popup_banner(
  p_admin_id TEXT,
  p_banner_id UUID
) RETURNS JSONB
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_id UUID;
  v_banner popup_banners;
BEGIN
  -- Resolve admin UUID from username or UUID
  v_admin_id := CASE
    WHEN p_admin_id LIKE '________-____-____-____-____________' THEN p_admin_id::UUID
    ELSE (SELECT id FROM users WHERE username = p_admin_id AND role = 'admin')
  END;
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN:Not authorized');
  END IF;

  SELECT * INTO v_banner FROM popup_banners WHERE id = p_banner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND:Banner not found');
  END IF;

  DELETE FROM popup_banners WHERE id = p_banner_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_banner.id,
    'image_path', v_banner.image_path
  );
END;
$$;

-- =============================================================================
-- 2. admin_toggle_popup_banner — toggle active status
-- =============================================================================
CREATE OR REPLACE FUNCTION admin_toggle_popup_banner(
  p_admin_id TEXT,
  p_banner_id UUID,
  p_active BOOLEAN
) RETURNS JSONB
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
AS $$
DECLARE
  v_admin_id UUID;
  v_banner popup_banners;
BEGIN
  v_admin_id := CASE
    WHEN p_admin_id LIKE '________-____-____-____-____________' THEN p_admin_id::UUID
    ELSE (SELECT id FROM users WHERE username = p_admin_id AND role = 'admin')
  END;
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('error', 'FORBIDDEN:Not authorized');
  END IF;

  UPDATE popup_banners
  SET active = p_active, updated_at = now()
  WHERE id = p_banner_id
  RETURNING * INTO v_banner;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NOT_FOUND:Banner not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'banner', row_to_json(v_banner));
END;
$$;

-- =============================================================================
-- 3. get_active_popup_banners — for React user app (anon access)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_active_popup_banners()
RETURNS SETOF popup_banners
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE sql
AS $$
  SELECT * FROM popup_banners WHERE active = true ORDER BY sort_order ASC, created_at DESC;
$$;
