import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = { "Access-Control-Allow-Origin": "https://admin.mynumber9.uk", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token", "Access-Control-Allow-Credentials": "true" }
const json = (body: unknown, s = 200) => new Response(JSON.stringify(body), { status: s, headers: { "Content-Type": "application/json", ...corsHeaders } })

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
    try {
      const token = (() => {
        const headerToken = req.headers.get('x-session-token') || '';
        if (headerToken) return headerToken;
        const cookieHeader = req.headers.get('cookie') || '';
        const match = cookieHeader.match(/n9_session=([^;]+)/);
        if (match) return match[1];
        return '';
      })()
      if (!token) return json({ error: 'Unauthorized' }, 401)

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!
      const serviceKey = Deno.env.get("N9_SERVICE_ROLE_KEY")!
      const supabase = createClient(supabaseUrl, serviceKey)

      const tokenHash = await sha256(token)
      const { data: session } = await supabase
        .from('sessions')
        .select('id, user_id, logged_out_at')
        .eq('token_hash', tokenHash)
        .single()

      if (!session || session.logged_out_at) return json({ error: 'Invalid session' }, 401)

      const { data: user } = await supabase
        .from('n9_users')
        .select('role')
        .eq('id', session.user_id)
        .single()

      if (!user || user.role !== 'admin') return json({ error: 'Forbidden' }, 403)

      const res = await fetch(`${supabaseUrl}/rest/v1/gateway_whitelist?select=id,ip_address,label,created_at&order=created_at.desc`, {
        headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
      })

      if (!res.ok) {
        const text = await res.text()
        return json({ error: `Query failed: ${res.status} ${text}` }, 500)
      }

      const rows = await res.json()
      return json({ success: true, data: rows })

    } catch (err) { return json({ error: err instanceof Error ? err.message : String(err) }, 500) }
  },
}
