-- Anti-spam: satu deposit PENDING per user sampai admin approve/reject.
-- 15 menit lock = UX client; gate ini = server hard stop.

CREATE OR REPLACE FUNCTION submit_deposit(
  p_user_id          UUID,
  p_amount           DECIMAL(12,2),
  p_method           VARCHAR DEFAULT 'Transfer Bank',
  p_proof_image_url  TEXT DEFAULT NULL,
  p_idempotency_key  VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_tx JSONB;
  v_session_token TEXT;
  v_actual_user_id UUID;
  v_role TEXT;
BEGIN
  PERFORM check_rate_limit(p_user_id, 'SUBMIT_DEPOSIT', 10, 60000);

  v_role := current_setting('role', true);
  IF v_role != 'service_role' THEN
    v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
    IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    SELECT id INTO v_actual_user_id FROM users
      WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex') AND session_expires_at > NOW();
    IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE user_id = p_user_id
      AND type = 'DEPOSIT'
      AND status = 'PENDING'
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'DEPOSIT_ALREADY_PENDING';
  END IF;

  INSERT INTO transactions (user_id, type, amount, status, method, proof_image_url, idempotency_key)
  VALUES (p_user_id, 'DEPOSIT', p_amount, 'PENDING', p_method, p_proof_image_url, p_idempotency_key)
  RETURNING jsonb_build_object('id', id, 'created_at', created_at, 'amount', amount, 'status', status) INTO v_tx;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_deposit(UUID, DECIMAL, VARCHAR, TEXT, VARCHAR) TO anon, authenticated, service_role;
