-- admin_create_user: create a user directly from the admin panel.
-- Password is hashed server-side with pgcrypto bcrypt (cost 10), compatible
-- with bcryptjs `compare` used in the user-login edge function.
-- Account is created ACTIVE / APPROVED / KYC-approved so the user can log in
-- immediately (admin-created accounts are trusted).
--
-- Security: SECURITY DEFINER + EXECUTE revoked from PUBLIC/anon/authenticated and
-- granted only to service_role. The only legitimate caller is the admin-proxy
-- edge function (service role), which itself now enforces an admin-role check.
-- This prevents a regular user (or anon key holder) from minting an admin account.

CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_username            text,
  p_password            text,
  p_display_name        text DEFAULT NULL,
  p_email               text DEFAULT NULL,
  p_phone               text DEFAULT NULL,
  p_country             text DEFAULT 'Indonesia',
  p_role                text DEFAULT 'user',
  p_bank_name           text DEFAULT NULL,
  p_bank_account_number text DEFAULT NULL,
  p_bank_account_name   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uname    text := lower(trim(p_username));
  v_role     text := lower(coalesce(nullif(trim(p_role), ''), 'user'));
  v_id       uuid := gen_random_uuid();
  v_refcode  text := 'N9-USER-' || upper(substring(md5(random()::text) from 1 for 5));
BEGIN
  IF v_uname IS NULL OR v_uname = '' THEN
    RAISE EXCEPTION 'username_required';
  END IF;
  IF p_password IS NULL OR length(p_password) < 4 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;
  IF v_role NOT IN ('user','admin','superadmin') THEN
    v_role := 'user';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE username = v_uname) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;
  IF p_email IS NOT NULL AND p_email <> '' AND EXISTS (SELECT 1 FROM users WHERE email = p_email) THEN
    RAISE EXCEPTION 'email_taken';
  END IF;

  INSERT INTO users (
    id, username, password_hash, display_name, email, phone, country, role,
    account_status, registration_status, login_status, kyc_status,
    referral_code, bank_name, bank_account_number, bank_account_name, approved_at
  ) VALUES (
    v_id, v_uname,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    coalesce(nullif(trim(p_display_name), ''), v_uname),
    coalesce(p_email, ''), coalesce(p_phone, ''), coalesce(nullif(trim(p_country), ''), 'Indonesia'),
    v_role,
    'ACTIVE', 'APPROVED', 'ACTIVE', 'APPROVED',
    v_refcode, coalesce(p_bank_name, ''), coalesce(p_bank_account_number, ''), coalesce(p_bank_account_name, ''),
    now()
  );

  INSERT INTO wallet (user_id) VALUES (v_id);

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_user(text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_create_user(text,text,text,text,text,text,text,text,text,text) TO service_role;
