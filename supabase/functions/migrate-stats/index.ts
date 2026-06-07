import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://admin.mynumber9.uk",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Credentials": "true",
  }

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })

  const token = (() => {
    const headerToken = req.headers.get('x-session-token') || '';
    if (headerToken) return headerToken;
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/n9_session=([^;]+)/);
    if (match) return match[1];
    return '';
  })()
  if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } })

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceKey = Deno.env.get("N9_SERVICE_ROLE_KEY")!
  const supabase = createClient(supabaseUrl, serviceKey)

  const tokenHash = await sha256(token)
  const { data: session } = await supabase
    .from('sessions')
    .select('id, user_id, logged_out_at')
    .eq('token_hash', tokenHash)
    .single()

  if (!session || session.logged_out_at) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }

  const { data: user } = await supabase
    .from('n9_users')
    .select('role')
    .eq('id', session.user_id)
    .single()

  if (!user || user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } })
  }

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

  const { error } = await supabase.rpc("exec_sql", { sql: SQL }).maybeSingle()
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json", ...corsHeaders } })
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", ...corsHeaders } })
})
