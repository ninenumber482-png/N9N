-- =============================================================================
-- FIX: KYC Documents RLS Policy Performance
-- 
-- Problem: RLS policy kyc_own uses correlated subquery (EXISTS) which causes
-- N+1 query problem. Every row in kyc_documents triggers a subquery to users.
-- With 28 rows, this means 28 subqueries per SELECT.
-- 
-- Error: canceling statement due to statement timeout (57014)
-- 
-- Solution: Replace correlated subquery with a security definer function
-- that caches the user lookup, reducing N queries to 1.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Create helper function for KYC RLS (security definer, cached)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_current_user_id_for_kyc()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_token TEXT;
  v_user_id UUID;
BEGIN
  v_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_token IS NULL THEN RETURN NULL; END IF;
  
  SELECT id INTO v_user_id 
  FROM users 
  WHERE session_token = v_token 
    AND session_expires_at > NOW();
  
  RETURN v_user_id;
END;
$$;

-- =============================================================================
-- 2. Drop old slow policies
-- =============================================================================

DROP POLICY IF EXISTS "kyc_own" ON kyc_documents;
DROP POLICY IF EXISTS "kyc_update_own" ON kyc_documents;
DROP POLICY IF EXISTS "kyc_delete_own" ON kyc_documents;

-- =============================================================================
-- 3. Create new fast policies using cached function
-- =============================================================================

-- SELECT: user can only see their own KYC docs
CREATE POLICY "kyc_own_fast" ON kyc_documents
FOR SELECT TO anon
USING (user_id = get_current_user_id_for_kyc());

-- UPDATE: user can only update their own KYC docs
CREATE POLICY "kyc_update_fast" ON kyc_documents
FOR UPDATE TO anon
USING (user_id = get_current_user_id_for_kyc());

-- DELETE: user can only delete their own KYC docs
CREATE POLICY "kyc_delete_fast" ON kyc_documents
FOR DELETE TO anon
USING (user_id = get_current_user_id_for_kyc());

-- INSERT: remains open (needed for registration before session)
DROP POLICY IF EXISTS "kyc_insert_anon" ON kyc_documents;
CREATE POLICY "kyc_insert_anon" ON kyc_documents
FOR INSERT TO anon
WITH CHECK (true);

-- =============================================================================
-- 4. Add composite index for KYC + user lookups
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_kyc_user_status ON kyc_documents(user_id, status);

-- =============================================================================
-- 5. Grant execute on helper function
-- =============================================================================

GRANT EXECUTE ON FUNCTION get_current_user_id_for_kyc() TO anon, authenticated;

COMMIT;
