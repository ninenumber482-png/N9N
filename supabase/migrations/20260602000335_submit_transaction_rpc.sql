-- SECURITY DEFINER RPCs for deposit/withdrawal submission (bypasses RLS).
-- Same pattern as place_bet() — the browser client calls these instead of
-- direct INSERT into the RLS-protected transactions table.

CREATE OR REPLACE FUNCTION submit_deposit(
  p_user_id         UUID,
  p_amount          DECIMAL(12,2),
  p_method          VARCHAR DEFAULT 'Transfer Bank',
  p_proof_image_url TEXT DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx JSONB;
BEGIN
  INSERT INTO transactions (user_id, type, amount, status, method, proof_image_url, idempotency_key)
  VALUES (p_user_id, 'DEPOSIT', p_amount, 'PENDING', p_method, p_proof_image_url, p_idempotency_key)
  RETURNING jsonb_build_object(
    'id', id,
    'created_at', created_at,
    'amount', amount,
    'status', status
  ) INTO v_tx;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_deposit(UUID, DECIMAL, VARCHAR, TEXT, VARCHAR) TO anon, authenticated, service_role;

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
AS $$
DECLARE
  v_tx JSONB;
BEGIN
  INSERT INTO transactions (user_id, type, amount, status, method, bank_name, bank_account_number, bank_account_name, idempotency_key)
  VALUES (p_user_id, 'WITHDRAWAL', p_amount, 'PENDING', p_method, p_bank_name, p_bank_account_number, p_bank_account_name, p_idempotency_key)
  RETURNING jsonb_build_object(
    'id', id,
    'created_at', created_at,
    'amount', amount,
    'status', status
  ) INTO v_tx;

  RETURN v_tx;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_withdrawal(UUID, DECIMAL, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO anon, authenticated, service_role;
