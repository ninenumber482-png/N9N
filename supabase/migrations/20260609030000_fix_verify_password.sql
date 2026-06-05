-- Fix verify_password RPC: pgcrypto lives in extensions schema in Supabase
CREATE OR REPLACE FUNCTION verify_password(user_id UUID, password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  pw_hash TEXT;
BEGIN
  SELECT password_hash INTO pw_hash FROM users WHERE id = user_id;
  IF pw_hash IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN crypt(password, pw_hash) = pw_hash;
END;
$$;
