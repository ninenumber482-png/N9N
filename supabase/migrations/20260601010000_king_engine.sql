-- =============================================================================
-- 3D KING SETTLEMENT ENGINE
-- Shared source of truth for draws + atomic, idempotent bet settlement.
-- Written by the Angular admin console (/3dking); read by the React app (/king).
--
-- NOTE: apply this by pasting it into the Supabase SQL Editor (db push is blocked
-- by an unrelated pending migration). It is safe to re-run (idempotent DDL).
-- =============================================================================

-- Draw results — one row per session. The PRIMARY KEY is the idempotency guard
-- that makes settle_session() safe against the admin engine's 100ms tick.
CREATE TABLE IF NOT EXISTS king_results (
  session_code VARCHAR(20) PRIMARY KEY,
  d1           SMALLINT NOT NULL,
  d2           SMALLINT NOT NULL,
  d3           SMALLINT NOT NULL,
  total        SMALLINT NOT NULL,        -- d1 + d2 + d3 (0..27)
  big_small    VARCHAR(8) NOT NULL,      -- total >= 14 ? 'BIG' : 'SMALL'
  odd_even     VARCHAR(8) NOT NULL,      -- total odd  ? 'ODD' : 'EVEN'
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS king_results_created_at_idx ON king_results(created_at DESC);

-- Admin-planned upcoming draws. The admin console (/3dking) upserts the intended
-- result for a session here; settle_session() treats it as authoritative so the
-- outcome is the admin's choice regardless of which client triggers settlement.
CREATE TABLE IF NOT EXISTS king_planned (
  session_code VARCHAR(20) PRIMARY KEY,
  d1           SMALLINT NOT NULL CHECK (d1 BETWEEN 0 AND 9),
  d2           SMALLINT NOT NULL CHECK (d2 BETWEEN 0 AND 9),
  d3           SMALLINT NOT NULL CHECK (d3 BETWEEN 0 AND 9),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- settle_session(code, d1, d2, d3)
-- Single transaction: publish the draw once, settle that session's PENDING bets
-- (WIN/LOSE + actual_payout), and credit winners' wallets. Re-runs are no-ops.
-- The result is, in priority order: the admin's king_planned draw, else the
-- digits passed in (the engine's random fallback). Resolving the plan HERE — in
-- the transaction — means a page reload / catch-up sweep can never settle a
-- planned session on random digits.
CREATE OR REPLACE FUNCTION settle_session(
  p_code TEXT,
  p_d1   INT,
  p_d2   INT,
  p_d3   INT
) RETURNS king_results
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_d1    INT;
  v_d2    INT;
  v_d3    INT;
  v_total INT;
  v_bs    VARCHAR(8);
  v_oe    VARCHAR(8);
  v_row   king_results;
BEGIN
  -- Authoritative result: admin plan if present, else the passed-in digits.
  SELECT d1, d2, d3 INTO v_d1, v_d2, v_d3 FROM king_planned WHERE session_code = p_code;
  IF NOT FOUND THEN
    v_d1 := p_d1; v_d2 := p_d2; v_d3 := p_d3;
  END IF;

  v_total := v_d1 + v_d2 + v_d3;
  v_bs := CASE WHEN v_total >= 14    THEN 'BIG' ELSE 'SMALL' END;
  v_oe := CASE WHEN v_total % 2 = 1  THEN 'ODD' ELSE 'EVEN' END;

  -- Idempotency gate: only the first caller for this session inserts the draw.
  INSERT INTO king_results (session_code, d1, d2, d3, total, big_small, odd_even)
  VALUES (p_code, v_d1, v_d2, v_d3, v_total, v_bs, v_oe)
  ON CONFLICT (session_code) DO NOTHING
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    -- Already settled by an earlier call — return the existing draw, touch nothing.
    SELECT * INTO v_row FROM king_results WHERE session_code = p_code;
    RETURN v_row;
  END IF;

  -- Settle this session's pending bets. Win rule mirrors NUMBER9 king.js payouts:
  --   BIG/SMALL  -> matches big_small      (2x, stored in potential_payout)
  --   ODD/EVEN   -> matches odd_even        (2x)
  --   number     -> selection = total       (3x)
  UPDATE bets b
  SET status        = 'SETTLED',
      settled_at    = NOW(),
      result        = CASE WHEN (
             (b.selection IN ('BIG','SMALL') AND b.selection = v_bs)
          OR (b.selection IN ('ODD','EVEN')  AND b.selection = v_oe)
          OR (b.selection ~ '^[0-9]+$'       AND b.selection::int = v_total)
        ) THEN 'WIN' ELSE 'LOSE' END,
      actual_payout = CASE WHEN (
             (b.selection IN ('BIG','SMALL') AND b.selection = v_bs)
          OR (b.selection IN ('ODD','EVEN')  AND b.selection = v_oe)
          OR (b.selection ~ '^[0-9]+$'       AND b.selection::int = v_total)
        ) THEN b.potential_payout ELSE 0 END
  WHERE b.session_code = p_code AND b.status = 'PENDING';

  -- Credit winners' main balance (stake was already debited at bet time).
  UPDATE wallet w
  SET balance_main = w.balance_main + s.win_sum,
      updated_at   = NOW()
  FROM (
    SELECT user_id, SUM(actual_payout) AS win_sum
    FROM bets
    WHERE session_code = p_code AND result = 'WIN'
    GROUP BY user_id
  ) s
  WHERE w.user_id = s.user_id;

  RETURN v_row;
END;
$$;

-- Readable/callable by the app keys (RLS is off on this project).
GRANT SELECT ON king_results TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON king_planned TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION settle_session(TEXT, INT, INT, INT) TO anon, authenticated, service_role;
