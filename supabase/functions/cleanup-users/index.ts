import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://admin.mynumber9.uk",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY')
      if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfiguration' }, 500)

      const supabase = createClient(supabaseUrl, serviceRoleKey)

      // Auth check: require valid admin session token
      const token = req.headers.get('x-session-token') || ''
      if (!token) return json({ error: 'Unauthorized' }, 401)

      const tokenHash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
      ).map(b => b.toString(16).padStart(2, '0')).join('');

      const { data: session, error: sessErr } = await supabase
        .from('sessions')
        .select('id, user_id, logged_out_at, expires_at')
        .eq('token_hash', tokenHash)
        .single()

      if (sessErr || !session || session.logged_out_at) return json({ error: 'Invalid session' }, 401)
      if (session.expires_at && new Date(session.expires_at) < new Date()) return json({ error: 'Session expired' }, 401)

      const { data: adminUser } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user_id)
        .single()

      if (!adminUser || adminUser.role !== 'admin') return json({ error: 'Admin access required' }, 403)

      const dupIds = [
        '6bf60024-6d81-4a42-8c73-8d5b54f93a56',
        '49fa40c6-5fac-471f-9f24-d7a7907c13f9',
        'd02534f1-a705-4373-ba69-78ed5f99331d',
        '1634f6c5-f60a-4495-82cc-08281f3dc7e4',
      ]

      // Delete audit_log entries for duplicate users first (trigger will try to insert new ones)
      const { error: auditDelErr } = await supabase
        .from('audit_log')
        .delete()
        .in('admin_id', dupIds)
      if (auditDelErr) return json({ error: `audit_log delete failed: ${auditDelErr.message}` }, 500)

      // Delete duplicate users
      const { error: delErr } = await supabase
        .from('users')
        .delete()
        .in('id', dupIds)
      if (delErr) return json({ error: `user delete failed: ${delErr.message}` }, 500)

      // Clean up demo user
      const { error: txErr } = await supabase
        .from('transactions')
        .delete()
        .eq('user_id', 'a0000000-0000-0000-0000-000000000003')
      if (txErr) return json({ error: `tx delete failed: ${txErr.message}` }, 500)

      const { error: wErr } = await supabase
        .from('wallet')
        .delete()
        .eq('user_id', 'a0000000-0000-0000-0000-000000000003')
      if (wErr) return json({ error: `wallet delete failed: ${wErr.message}` }, 500)

      const { error: sErr } = await supabase
        .from('sessions')
        .delete()
        .eq('user_id', 'a0000000-0000-0000-0000-000000000003')
      if (sErr) return json({ error: `session delete failed: ${sErr.message}` }, 500)

      const { error: dErr } = await supabase
        .from('users')
        .delete()
        .eq('id', 'a0000000-0000-0000-0000-000000000003')
      if (dErr) return json({ error: `demo delete failed: ${dErr.message}` }, 500)

      return json({ success: true, message: 'Cleanup completed' })
    } catch (error) {
      console.error("[CLEANUP] Exception:", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
}
