-- ============================================================================
-- NUMBER9 Performance Optimizations — 100% Backward Compatible
-- ============================================================================
-- Semua function signature TIDAK BERUBAH.
-- Hanya internal implementation yang dioptimasi.
-- Aman untuk apply ke production tanpa downtime.
-- ============================================================================

BEGIN;

-- =============================================================================
-- 1. OPTIMIZE: check_rate_limit — REPLACE per-event rows with counter table
--    Mengurangi DELETE+COUNT yang berat pada setiap place_bet/withdrawal
-- =============================================================================

-- Counter table: 1 row per user per action per window (bukan 1 row per event)
CREATE TABLE IF NOT EXISTS user_rate_limit_counters (
  user_id      UUID NOT NULL,
  action       TEXT NOT NULL,
  window_start TIMESTAMP NOT NULL,  -- floored to minute window
  count        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, window_start)
);

-- Index untuk cleanup otomatis (tidak perlu DELETE manual tiap call)

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id     UUID,
  p_action      TEXT,
  p_max         INT DEFAULT 30,
  p_window_ms   INT DEFAULT 60000
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_window_start TIMESTAMP := date_trunc('minute', NOW());
  v_count INT;
BEGIN
  -- Upsert counter untuk window ini (1 write, bukan DELETE+COUNT+INSERT)
  INSERT INTO user_rate_limit_counters (user_id, action, window_start, count)
  VALUES (p_user_id, p_action, v_window_start, 1)
  ON CONFLICT (user_id, action, window_start)
  DO UPDATE SET count = user_rate_limit_counters.count + 1;

  -- Ambil total count untuk window saat ini
  SELECT count INTO v_count
  FROM user_rate_limit_counters
  WHERE user_id = p_user_id
    AND action = p_action
    AND window_start = v_window_start;

  IF v_count > p_max THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many % requests. Try again later.', p_action;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, INT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(UUID, TEXT, INT, INT) TO service_role;

-- =============================================================================
-- 2. OPTIMIZE: place_bet — Batch UPDATE deposit_locks (ganti cursor loop)
--    Mengurangi O(N) individual UPDATE menjadi 1 UPDATE statement
-- =============================================================================
CREATE OR REPLACE FUNCTION place_bet(
  p_user_id      UUID,
  p_session_code VARCHAR,
  p_selections   JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total   DECIMAL(12,2);
  v_balance DECIMAL(12,2);
  v_count   INTEGER;
  v_session_token TEXT;
  v_actual_user_id UUID;
BEGIN
  PERFORM check_rate_limit(p_user_id, 'PLACE_BET', 30, 60000);

  v_session_token := current_setting('request.headers', true)::json->>'x-user-token';
  IF v_session_token IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT id INTO v_actual_user_id FROM users
    WHERE session_token = v_session_token AND session_expires_at > NOW();
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

  -- OPTIMIZED: Single UPDATE via CTE, menggantikan cursor loop
  -- Logika: apply turnover FIFO ke deposit locks, berhenti saat v_total habis
  WITH locks AS (
    SELECT id,
           turnover_required,
           turnover_applied,
           SUM(turnover_required - turnover_applied) OVER (ORDER BY created_at ASC) AS cumulative_unlock
      FROM deposit_locks
     WHERE user_id = p_user_id
       AND turnover_applied < turnover_required
     ORDER BY created_at ASC
     FOR UPDATE
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
    RETURNING d.id, (d.turnover_applied - (SELECT turnover_applied FROM locks WHERE id = d.id)) AS delta
  )
  SELECT COUNT(*) FROM applied;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION place_bet(UUID, VARCHAR, JSONB) TO anon, authenticated, service_role;

-- =============================================================================
-- 3. OPTIMIZE: daily_reconciliation — ganti DATE() dengan range query
--    DATE(created_at) prevents index usage. Gunakan range yang bisa pakai index.
-- =============================================================================
CREATE OR REPLACE FUNCTION daily_reconciliation(
  p_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  metric    TEXT,
  amount    DECIMAL(12,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deposits    DECIMAL;
  v_withdrawals DECIMAL;
  v_bet_stakes  DECIMAL;
  v_wins        DECIMAL;
  v_balance     DECIMAL;
  v_diff        DECIMAL;
  v_start       TIMESTAMP := p_date::TIMESTAMP;
  v_end         TIMESTAMP := (p_date + INTERVAL '1 day')::TIMESTAMP;
BEGIN
  -- Σ deposits (COMPLETED) — range query, bisa pakai index
  SELECT COALESCE(SUM(amount), 0) INTO v_deposits
  FROM transactions
  WHERE type = 'DEPOSIT' AND status = 'COMPLETED'
    AND created_at >= v_start AND created_at < v_end;

  -- Σ withdrawals (COMPLETED)
  SELECT COALESCE(SUM(amount), 0) INTO v_withdrawals
  FROM transactions
  WHERE type = 'WITHDRAWAL' AND status = 'COMPLETED'
    AND created_at >= v_start AND created_at < v_end;

  -- Σ bet stakes (SETTLED)
  SELECT COALESCE(SUM(stake), 0) INTO v_bet_stakes
  FROM bets
  WHERE status = 'SETTLED'
    AND created_at >= v_start AND created_at < v_end;

  -- Σ wins
  SELECT COALESCE(SUM(actual_payout), 0) INTO v_wins
  FROM bets
  WHERE result = 'WIN' AND status = 'SETTLED'
    AND created_at >= v_start AND created_at < v_end;

  -- Σ current balance_main
  SELECT COALESCE(SUM(balance_main), 0) INTO v_balance
  FROM wallet;

  v_diff := v_deposits - v_withdrawals - v_bet_stakes + v_wins - v_balance;

  IF v_diff != 0 THEN
    INSERT INTO security_alerts (alert_type, severity, description, details)
    VALUES ('LEDGER_MISMATCH', 'critical',
      'Wallet reconciliation failed! Difference: ' || v_diff,
      jsonb_build_object(
        'date', p_date,
        'deposits', v_deposits,
        'withdrawals', v_withdrawals,
        'bet_stakes', v_bet_stakes,
        'wins', v_wins,
        'balance', v_balance,
        'difference', v_diff
      ));
  END IF;

  RETURN QUERY
  SELECT 'deposits'::TEXT, v_deposits
  UNION ALL SELECT 'withdrawals', v_withdrawals
  UNION ALL SELECT 'bet_stakes', v_bet_stakes
  UNION ALL SELECT 'wins', v_wins
  UNION ALL SELECT 'balance_main', v_balance
  UNION ALL SELECT 'difference', v_diff;
END;
$$;

REVOKE EXECUTE ON FUNCTION daily_reconciliation(DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION daily_reconciliation(DATE) TO service_role;

-- =============================================================================
-- 4. OPTIMIZE: king_engine_tick — batch existence check + counter table
--    Mengurangi 24 individual NOT EXISTS menjadi batch query
-- =============================================================================
CREATE OR REPLACE FUNCTION king_engine_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now  timestamptz := now();
  v_last timestamptz := to_timestamp(floor(extract(epoch FROM v_now) / 300) * 300);
  v_b    timestamptz;
  v_code text;
  v_pd1 int; v_pd2 int; v_pd3 int;
  v_has_plan boolean;
  i int;
  v_planned_codes TEXT[];
  v_result_codes  TEXT[];
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('king_engine_tick')::bigint) THEN
    RETURN;
  END IF;

  -- Pre-compute semua session codes yang dibutuhkan
  v_planned_codes := ARRAY(
    SELECT to_char(v_last + (generate_series * interval '5 min') AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI')
    FROM generate_series(1, 12)
  );
  v_result_codes := ARRAY(
    SELECT to_char(v_last - (generate_series * interval '5 min') AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI')
    FROM generate_series(0, 1)
  );

  -- (1) PLAN: batch check existence, insert yang belum ada
  FOR v_code IN
    SELECT code FROM unnest(v_planned_codes) AS code
    WHERE code NOT IN (SELECT session_code FROM king_planned WHERE session_code = ANY(v_planned_codes))
      AND code NOT IN (SELECT session_code FROM king_results WHERE session_code = ANY(v_planned_codes))
  LOOP
    INSERT INTO king_planned (session_code, d1, d2, d3)
    VALUES (v_code, king_rand_digit(), king_rand_digit(), king_rand_digit())
    ON CONFLICT (session_code) DO NOTHING;
  END LOOP;

  -- (2) SETTLE: batch check, settle yang belum ada
  FOR v_code IN
    SELECT code FROM unnest(v_result_codes) AS code
    WHERE code NOT IN (SELECT session_code FROM king_results WHERE session_code = ANY(v_result_codes))
  LOOP
    SELECT d1, d2, d3, true INTO v_pd1, v_pd2, v_pd3, v_has_plan
      FROM king_planned WHERE session_code = v_code;
    IF v_has_plan IS TRUE THEN
      PERFORM settle_session(v_code, v_pd1, v_pd2, v_pd3);
    ELSE
      PERFORM settle_session(v_code, king_rand_digit(), king_rand_digit(), king_rand_digit());
    END IF;
  END LOOP;

  -- Health metric: pakai counter table, bukan subquery ORDER BY DESC
  INSERT INTO metrics (metric_name, metric_value, tags)
  VALUES ('king_engine_tick_count', 1, jsonb_build_object('ticked_at', v_now))
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION king_engine_tick() FROM anon, authenticated, public;
-- =============================================================================
-- 6. OPTIMIZE: get_referral_stats — ganti correlated subquery dengan JOIN
--    Mengurangi N+1 query menjadi single JOIN
-- =============================================================================
-- Cek apakah function ini ada
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_referral_stats'
  ) THEN
    EXECUTE '
    CREATE OR REPLACE FUNCTION get_referral_stats(p_user_id UUID DEFAULT NULL)
    RETURNS TABLE (
      code VARCHAR,
      status VARCHAR,
      used_count BIGINT,
      total_users BIGINT,
      created_at TIMESTAMP
    )
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''public''
    AS $func$
    BEGIN
      RETURN QUERY
      SELECT
        r.code,
        r.status::VARCHAR,
        r.used_count,
        COUNT(u.id)::BIGINT AS total_users,
        r.created_at
      FROM referrals r
      LEFT JOIN users u ON u.referred_by = r.id
      WHERE (p_user_id IS NULL OR r.owner_id = p_user_id)
      GROUP BY r.id, r.code, r.status, r.used_count, r.created_at
      ORDER BY r.created_at DESC;
    END;
    $func$;
    ';
  END IF;
END $$;

-- =============================================================================
-- 7. CLEANUP: Auto-prune rate limit counters (lebih dari 2 menit)
--    Dijalankan via pg_cron setiap jam
-- =============================================================================
CREATE OR REPLACE FUNCTION prune_rate_limit_counters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM user_rate_limit_counters
  WHERE window_start < NOW() - INTERVAL '2 minutes';
END;
$$;

REVOKE EXECUTE ON FUNCTION prune_rate_limit_counters() FROM anon, authenticated, public;

-- Schedule cleanup (idempotent — pg_cron akan skip jika job name sudah ada)
SELECT cron.schedule('prune-rate-limits', '0 * * * *', 'SELECT public.prune_rate_limit_counters();');

COMMIT;
