-- Skip x-user-token check when called with service_role key.
-- The Edge Function already validates the token; passing it through
-- REST API headers is unreliable (gateway strips custom headers).
-- service_role calls are trusted.

CREATE OR REPLACE FUNCTION submit_withdrawal(
  p_user_id             UUID,
  p_amount              DECIMAL(12,2),
  p_method              VARCHAR DEFAULT 'Bank Transfer',
  p_bank_name           VARCHAR DEFAULT NULL,
  p_bank_account_number VARCHAR DEFAULT NULL,
  p_bank_account_name   VARCHAR DEFAULT NULL,
  p_idempotency_key     VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_balance DECIMAL(12,2);
  v_tx JSONB;
  v_session_token TEXT;
  v_actual_user_id UUID;
  v_locked_remaining DECIMAL(12,2);
  v_role TEXT;
BEGIN
  PERFORM check_rate_limit(p_user_id, 'SUBMIT_WITHDRAWAL', 10, 60000);

  v_role := current_setting('role', true);
  IF v_role != 'service_role' THEN
    v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
    IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
    SELECT id INTO v_actual_user_id FROM users
      WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex') AND session_expires_at > NOW();
    IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  PERFORM 1 FROM deposit_locks WHERE user_id = p_user_id AND turnover_applied < turnover_required FOR UPDATE;
  SELECT COALESCE(SUM(turnover_required - turnover_applied), 0) INTO v_locked_remaining
    FROM deposit_locks WHERE user_id = p_user_id AND turnover_applied < turnover_required;
  IF v_locked_remaining > 0 THEN RAISE EXCEPTION 'TURNOVER_NOT_MET: % remaining', v_locked_remaining; END IF;

  UPDATE wallet SET balance_main = balance_main - p_amount, updated_at = NOW() WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount, status, method, bank_name, bank_account_number, bank_account_name, idempotency_key)
  VALUES (p_user_id, 'WITHDRAWAL', p_amount, 'PENDING', p_method, p_bank_name, p_bank_account_number, p_bank_account_name, p_idempotency_key)
  RETURNING jsonb_build_object('id', id, 'created_at', created_at, 'amount', amount, 'status', status) INTO v_tx;

  RETURN v_tx;
END;
$$;

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

  INSERT INTO transactions (user_id, type, amount, status, method, proof_image_url, idempotency_key)
  VALUES (p_user_id, 'DEPOSIT', p_amount, 'PENDING', p_method, p_proof_image_url, p_idempotency_key)
  RETURNING jsonb_build_object('id', id, 'created_at', created_at, 'amount', amount, 'status', status) INTO v_tx;

  RETURN v_tx;
END;
$$;
