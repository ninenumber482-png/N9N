-- =============================================================================
-- FIX: KYC Documents Query Performance via RPC
-- 
-- Problem: PostgREST embedded resource causes 36s timeout
-- Solution: RPC function that returns KYC docs with user info in one call
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Create RPC for admin to get all KYC documents with user info
-- =============================================================================

CREATE OR REPLACE FUNCTION get_kyc_documents_admin(
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
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
  ORDER BY k.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_kyc_documents_admin(INT, INT) TO anon, authenticated, service_role;

-- =============================================================================
-- 2. Create RPC for user to get their own KYC documents
-- =============================================================================

CREATE OR REPLACE FUNCTION get_my_kyc_documents()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  document_type TEXT,
  document_url TEXT,
  status TEXT,
  rejection_reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_token TEXT;
  v_user_id UUID;
BEGIN
  v_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  
  SELECT id INTO v_user_id 
  FROM users 
  WHERE session_token = v_token 
    AND session_expires_at > NOW();
  
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

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
    k.created_at
  FROM kyc_documents k
  WHERE k.user_id = v_user_id
  ORDER BY k.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_kyc_documents() TO anon, authenticated;

COMMIT;
