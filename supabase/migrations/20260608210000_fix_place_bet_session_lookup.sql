-- FIX: place_bet was looking for session_token in users table
-- But sessions are actually stored in a separate sessions table with token_hash
-- This migration updates place_bet to correctly query the sessions table

CREATE OR REPLACE FUNCTION public.place_bet(p_user_id uuid, p_session_code character varying, p_selections jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $function$
DECLARE
  v_total   DECIMAL(12,2);
  v_balance DECIMAL(12,2);
  v_count   INTEGER;
  v_lock_rows INTEGER;
  v_session_token TEXT;
  v_actual_user_id UUID;
  v_token_hash TEXT;
BEGIN
  PERFORM check_rate_limit(p_user_id, 'PLACE_BET', 30, 60000);

  -- Get session token from request headers
  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- Hash the token and look up in sessions table
  v_token_hash := encode(digest(v_session_token, 'sha256'), 'hex');
  SELECT user_id INTO v_actual_user_id FROM sessions
    WHERE token_hash = v_token_hash AND expires_at > NOW()
    LIMIT 1;

  -- Verify user ID matches
  IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT COALESCE(SUM((s->>'stake')::DECIMAL), 0) INTO v_total FROM jsonb_array_elements(p_selections) AS s;
  IF v_total <= 0 THEN RAISE EXCEPTION 'INVALID_STAKE'; END IF;

  SELECT balance_main INTO v_balance FROM wallet WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_balance < v_total THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  INSERT INTO bets (user_id, session_code, bet_code, selection, stake, potential_payout, status)
  SELECT p_user_id, p_session_code, s->>'bet_code', s->>'selection',
         (s->>'stake')::DECIMAL, (s->>'potential_payout')::DECIMAL, 'PENDING'
  FROM jsonb_array_elements(p_selections) AS s;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE wallet
     SET balance_main = balance_main - v_total,
         total_turnover = total_turnover + v_total,
         updated_at = NOW()
   WHERE user_id = p_user_id;

  WITH locked AS (
    SELECT id, turnover_required, turnover_applied, created_at
      FROM deposit_locks
     WHERE user_id = p_user_id
       AND turnover_applied < turnover_required
     ORDER BY created_at ASC
     FOR UPDATE
  ),
  locks AS (
    SELECT id, turnover_required, turnover_applied,
           SUM(turnover_required - turnover_applied) OVER (ORDER BY created_at ASC) AS cumulative_unlock
      FROM locked
  ),
  applied AS (
    UPDATE deposit_locks d
       SET turnover_applied = LEAST(
             d.turnover_applied + GREATEST(0,
               LEAST(
                 l.turnover_required - l.turnover_applied,
                 v_total - (l.cumulative_unlock - (l.turnover_required - l.turnover_applied))
               )
             ),
             d.turnover_required
           )
      FROM locks l
     WHERE d.id = l.id
       AND l.cumulative_unlock - (l.turnover_required - l.turnover_applied) < v_total
    RETURNING d.id
  )
  SELECT COUNT(*) INTO v_lock_rows FROM applied;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) TO anon, authenticated, service_role;
