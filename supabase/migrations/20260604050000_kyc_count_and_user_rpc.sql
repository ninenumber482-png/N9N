-- =============================================================================
-- FIX: Additional KYC RPCs to eliminate all direct table queries
-- 
-- Problem: count('kyc_documents', 'status=eq.PENDING') and 
--          getKycDocsByUser(userId) still hit PostgREST with RLS overhead
-- Solution: RPC functions with SECURITY DEFINER for instant execution
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. RPC: Count KYC documents by status (for dashboard/sidebar badges)
-- =============================================================================

CREATE OR REPLACE FUNCTION count_kyc_by_status(p_status TEXT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_status IS NULL THEN
    RETURN (SELECT COUNT(*) FROM kyc_documents);
  ELSE
    RETURN (SELECT COUNT(*) FROM kyc_documents WHERE status = p_status);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION count_kyc_by_status(TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- 2. RPC: Get KYC documents for a specific user (admin view)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_kyc_documents_by_user(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  document_type TEXT,
  document_url TEXT,
  status TEXT,
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP,
  user_username TEXT,
  user_display_name TEXT
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
    k.document_url,
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

-- =============================================================================
-- 3. RPC: Get single KYC document with user info (for detail view)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_kyc_document_by_id(p_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  document_type TEXT,
  document_url TEXT,
  status TEXT,
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP,
  user_username TEXT,
  user_display_name TEXT
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
    k.document_url,
    k.status,
    k.rejection_reason,
    k.reviewed_by,
    k.reviewed_at,
    k.created_at,
    u.username as user_username,
    u.display_name as user_display_name
  FROM kyc_documents k
  LEFT JOIN users u ON k.user_id = u.id
  WHERE k.id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_kyc_document_by_id(UUID) TO anon, authenticated, service_role;

COMMIT;
