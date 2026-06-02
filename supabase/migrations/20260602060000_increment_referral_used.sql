-- Atomic increment for referral used_count to prevent race conditions
CREATE OR REPLACE FUNCTION increment_referral_used(p_referral_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE referrals
  SET used_count = used_count + 1, updated_at = NOW()
  WHERE id = p_referral_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_referral_used(UUID) TO anon, authenticated, service_role;
