-- =============================================================================
-- FIX: KYC RPC tanpa document_url base64 untuk menghindari timeout
-- 
-- Problem: document_url berisi base64 images ~1MB/row. LIMIT 50 = ~50MB response
--          yang menyebabkan PostgreSQL/PostgREST timeout saat serialization.
-- Solution: RPC baru tanpa document_url, tambahan RPC untuk get single doc URL.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. RPC: Get KYC documents list (TANPA document_url base64)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_kyc_documents_admin_list(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  document_type VARCHAR(50),
  status VARCHAR(20),
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP,
  user_username VARCHAR(50),
  user_display_name VARCHAR(100)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    k.id,
    k.user_id,
    k.document_type,
    k.status,
    k.rejection_reason,
    k.reviewed_by,
    k.reviewed_at,
    k.created_at,
    u.username as user_username,
    u.display_name as user_display_name
  FROM kyc_documents k
  LEFT JOIN users u ON k.user_id = u.id
  ORDER BY k.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_kyc_documents_admin_list(INT, INT) TO anon, authenticated, service_role;

-- =============================================================================
-- 2. RPC: Get single KYC document URL (hanya untuk preview/download)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_kyc_document_url(p_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_url TEXT;
BEGIN
  SELECT document_url INTO v_url FROM kyc_documents WHERE id = p_id;
  RETURN v_url;
END;
$$;

GRANT EXECUTE ON FUNCTION get_kyc_document_url(UUID) TO anon, authenticated, service_role;

-- =============================================================================
-- 3. Update RPC get_kyc_documents_by_user juga tanpa document_url
-- =============================================================================

DROP FUNCTION IF EXISTS get_kyc_documents_by_user(UUID);

CREATE OR REPLACE FUNCTION get_kyc_documents_by_user(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  document_type VARCHAR(50),
  status VARCHAR(20),
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP,
  user_username VARCHAR(50),
  user_display_name VARCHAR(100)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    k.id,
    k.user_id,
    k.document_type,
    k.status,
    k.rejection_reason,
    k.reviewed_by,
    k.reviewed_at,
    k.created_at,
    u.username as user_username,
    u.display_name as user_display_name
  FROM kyc_documents k
  LEFT JOIN users u ON k.user_id = u.id
  WHERE k.user_id = p_user_id
  ORDER BY k.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_kyc_documents_by_user(UUID) TO anon, authenticated, service_role;

COMMIT;
