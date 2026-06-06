CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users  int;
  v_admin_users  int;
  v_member_users int;
  v_total_bets   int;
  v_total_tx     int;
  v_pending_tx   int;
BEGIN
  SELECT count(*) INTO v_total_users FROM users;
  SELECT count(*) INTO v_admin_users FROM users WHERE role = 'admin';
  v_member_users := v_total_users - v_admin_users;

  SELECT count(*) INTO v_total_bets FROM bets;
  SELECT count(*) INTO v_total_tx FROM transactions;
  SELECT count(*) INTO v_pending_tx FROM transactions WHERE status = 'PENDING';

  RETURN json_build_object(
    'users',  v_total_users,
    'admins', v_admin_users,
    'members', v_member_users,
    'bets',   v_total_bets,
    'tx',     v_total_tx,
    'pending', v_pending_tx
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_platform_stats() TO anon;
