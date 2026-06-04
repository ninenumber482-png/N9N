-- NUMBER9 — Fix place_bet: add created_at to locked CTE SELECT
--
-- Error: "column 'created_at' does not exist"
-- Cause: CTE `locked` selected id, turnover_required, turnover_applied but
-- NOT created_at. The downstream CTE `cumulative` uses ORDER BY created_at
-- in a window function, which failed because the column wasn't available.

CREATE OR REPLACE FUNCTION public.place_bet(
  p_user_id uuid,
  p_session_code character varying,
  p_selections jsonb
)
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
BEGIN
  PERFORM check_rate_limit(p_user_id, 'PLACE_BET', 30, 60000);

  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT id INTO v_actual_user_id FROM users
    WHERE session_token = encode(digest(v_session_token, 'sha256'), 'hex') AND session_expires_at > NOW();
  IF v_actual_user_id IS NULL OR v_actual_user_id != p_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

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
  cumulative AS (
    SELECT id, turnover_required, turnover_applied,
           LEAST(v_total, SUM(turnover_required - turnover_applied) OVER (ORDER BY created_at)) AS total_to_apply
      FROM locked
  ),
  applied AS (
    UPDATE deposit_locks d
       SET turnover_applied = d.turnover_applied +
           LEAST(d.turnover_required - d.turnover_applied,
                 c.total_to_apply - COALESCE(SUM(d2.turnover_required - d2.turnover_applied)
                       FILTER (WHERE d2.created_at < d.created_at), 0))
      FROM cumulative c
      LEFT JOIN deposit_locks d2 ON d2.user_id = p_user_id
        AND d2.turnover_applied < d2.turnover_required
        AND d2.created_at < c.created_at
     WHERE d.id = c.id
       AND c.total_to_apply > 0
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_lock_rows FROM applied;

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) TO anon, authenticated, service_role;
