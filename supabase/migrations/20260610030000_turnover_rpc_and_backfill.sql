-- =============================================================================
-- Turnover eligibility RPC + backfill deposit_locks untuk deposit lama
-- =============================================================================

-- 1. RPC SECURITY DEFINER: check turnover eligibility (bypass RLS/anon issues)
CREATE OR REPLACE FUNCTION check_turnover_eligibility(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_required DECIMAL := 0;
  v_applied  DECIMAL := 0;
  v_remaining DECIMAL;
BEGIN
  SELECT
    COALESCE(SUM(turnover_required), 0),
    COALESCE(SUM(turnover_applied),  0)
  INTO v_required, v_applied
  FROM deposit_locks
  WHERE user_id = p_user_id
    AND turnover_applied < turnover_required;

  v_remaining := GREATEST(0, v_required - v_applied);

  RETURN jsonb_build_object(
    'is_unlocked', v_remaining <= 0,
    'required',    v_required,
    'achieved',    v_applied,
    'remaining',   v_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_turnover_eligibility(UUID) TO anon, authenticated, service_role;

-- 2. Backfill deposit_locks untuk deposit COMPLETED yang belum punya lock record
-- Distribusi FIFO: total_turnover dari wallet → applied ke deposit paling lama dulu
DO $$
DECLARE
  v_user         RECORD;
  v_dep          RECORD;
  v_wallet_to    DECIMAL;
  v_already_app  DECIMAL;
  v_free_to      DECIMAL;
  v_apply        DECIMAL;
BEGIN
  FOR v_user IN (
    SELECT DISTINCT t.user_id
    FROM   transactions t
    WHERE  t.type   = 'DEPOSIT'
      AND  t.status = 'COMPLETED'
      AND  NOT EXISTS (
             SELECT 1 FROM deposit_locks dl WHERE dl.deposit_id = t.id
           )
  ) LOOP
    -- total turnover yang sudah dicatat di wallet
    SELECT COALESCE(total_turnover, 0) INTO v_wallet_to
    FROM   wallet WHERE user_id = v_user.user_id;

    -- turnover yang sudah teralokasi ke lock records yang ada
    SELECT COALESCE(SUM(turnover_applied), 0) INTO v_already_app
    FROM   deposit_locks WHERE user_id = v_user.user_id;

    v_free_to := GREATEST(0, v_wallet_to - v_already_app);

    FOR v_dep IN (
      SELECT id, amount, created_at
      FROM   transactions
      WHERE  user_id = v_user.user_id
        AND  type    = 'DEPOSIT'
        AND  status  = 'COMPLETED'
        AND  NOT EXISTS (SELECT 1 FROM deposit_locks dl WHERE dl.deposit_id = id)
      ORDER BY created_at ASC
    ) LOOP
      v_apply   := LEAST(v_free_to, v_dep.amount);
      v_free_to := v_free_to - v_apply;

      INSERT INTO deposit_locks
        (user_id, deposit_id, amount, turnover_required, turnover_applied, created_at)
      VALUES
        (v_user.user_id, v_dep.id, v_dep.amount, v_dep.amount, v_apply, v_dep.created_at)
      ON CONFLICT (deposit_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
