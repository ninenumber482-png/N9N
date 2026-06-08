-- RPC: update_user_bank
-- Validates x-user-token, then updates bank details for the authenticated user only.
CREATE OR REPLACE FUNCTION public.update_user_bank(
  p_user_id UUID,
  p_bank_name VARCHAR DEFAULT NULL,
  p_bank_account_number VARCHAR DEFAULT NULL,
  p_bank_account_name VARCHAR DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_token TEXT;
  v_actual_user_id UUID;
BEGIN
  v_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT id INTO v_actual_user_id FROM users
    WHERE session_token = encode(digest(v_token, 'sha256'), 'hex')
      AND session_expires_at > NOW();
  IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE users
    SET bank_name = COALESCE(p_bank_name, bank_name),
        bank_account_number = COALESCE(p_bank_account_number, bank_account_number),
        bank_account_name = COALESCE(p_bank_account_name, bank_account_name),
        updated_at = NOW()
    WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_bank TO anon, authenticated;
