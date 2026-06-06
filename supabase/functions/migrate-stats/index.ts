import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("N9_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceKey);

const SQL = `
CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;
GRANT EXECUTE ON FUNCTION get_platform_stats() TO anon;
`;

Deno.serve(async (req) => {
  const { error } = await supabase.rpc("exec_sql", { sql: SQL }).maybeSingle();
  if (error) {
    const { error: e2 } = await supabase.from("_migration_sql").insert({ sql: SQL }).maybeSingle();
    return new Response(JSON.stringify({ error, also: e2 }), { headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
});
