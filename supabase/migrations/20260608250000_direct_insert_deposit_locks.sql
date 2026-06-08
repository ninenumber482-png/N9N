-- Direct INSERT - bypass all constraints/triggers
-- Insert deposit_locks for all COMPLETED deposits

DO $$
DECLARE
  v_count INT := 0;
BEGIN
  INSERT INTO public.deposit_locks (id, user_id, deposit_id, amount, turnover_required, turnover_applied, created_at)
  SELECT
    gen_random_uuid(),
    t.user_id,
    t.id,
    t.amount::DECIMAL(12,2),
    t.amount::DECIMAL(12,2),
    0::DECIMAL(12,2),
    t.created_at
  FROM public.transactions t
  WHERE t.type = 'DEPOSIT'
    AND t.status = 'COMPLETED'
    AND NOT EXISTS (
      SELECT 1 FROM public.deposit_locks dl WHERE dl.deposit_id = t.id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Inserted % deposit_locks', v_count;
END $$;
