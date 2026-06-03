-- =============================================================================
-- FIX: KYC RPC return types must match actual column types
-- 
-- Problem: document_type is VARCHAR(50), status is VARCHAR(20),
--          username is VARCHAR(50), display_name is VARCHAR(100)
--          but RPC declared them as TEXT causing "structure of query does not 
--          match function result type" error (42804)
-- =============================================================================

BEGIN;

-- Drop existing functions first (needed because return type changed)
DROP FUNCTION IF EXISTS get_kyc_documents_by_user(UUID);
DROP FUNCTION IF EXISTS get_kyc_document_by_id(UUID);

-- Fix get_kyc_documents_by_user
CREATE OR REPLACE FUNCTION get_kyc_documents_by_user(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  document_type VARCHAR(50),
  document_url TEXT,
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

-- Fix get_kyc_document_by_id
CREATE OR REPLACE FUNCTION get_kyc_document_by_id(p_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  document_type VARCHAR(50),
  document_url TEXT,
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
