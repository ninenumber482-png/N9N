-- ============================================================================
-- Gateway Activation Monitor — live deposit reconciliation. Additive + a
-- backward-compatible signature change to get_deposit_account. NOT YET APPLIED.
-- Spec: docs/superpowers/specs/2026-06-14-gateway-activation-monitor-design.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gateway_activations (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username      text NOT NULL DEFAULT '',
  account_label text,
  amount        numeric,
  activated_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gateway_activations_at ON public.gateway_activations(activated_at DESC);
REVOKE ALL ON public.gateway_activations FROM anon, authenticated;  -- admin/service_role only

-- get_deposit_account() (no-arg) is live; drop it and recreate with p_amount
-- (DEFAULT NULL → existing no-arg calls keep working; avoids ambiguous overload).
DROP FUNCTION IF EXISTS public.get_deposit_account();

CREATE OR REPLACE FUNCTION public.get_deposit_account(p_amount numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE
  v_uid   uuid;
  v_maint text;
  v_user  record;
  v       jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','NO_SESSION'); END IF;

  SELECT value INTO v_maint FROM platform_config WHERE key = 'maintenance_mode';
  IF v_maint = 'true' THEN RETURN jsonb_build_object('error','MAINTENANCE'); END IF;

  SELECT to_jsonb(a) INTO v FROM (
    SELECT provider_name, account_holder, account_number, instructions
    FROM platform_accounts WHERE status = 'ACTIVE' AND type = 'BANK'
    ORDER BY updated_at DESC NULLS LAST LIMIT 1
  ) a;
  IF v IS NULL THEN RETURN jsonb_build_object('error','NO_ACCOUNT'); END IF;

  -- Record the activation (one row per user, latest wins).
  SELECT username, display_name INTO v_user FROM users WHERE id = v_uid;
  INSERT INTO gateway_activations (user_id, username, account_label, amount, activated_at)
  VALUES (v_uid, COALESCE(v_user.display_name, v_user.username, ''), v->>'provider_name',
          NULLIF(p_amount, 0), NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET username = EXCLUDED.username, account_label = EXCLUDED.account_label,
        amount = EXCLUDED.amount, activated_at = NOW();

  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_deposit_account(numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_deposit_account(numeric) TO anon, authenticated, service_role;
