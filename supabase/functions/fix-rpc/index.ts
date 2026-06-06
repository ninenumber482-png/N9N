import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = { "Access-Control-Allow-Origin": "https://admin.mynumber9.uk", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
const json = (body: unknown, s = 200) => new Response(JSON.stringify(body), { status: s, headers: { "Content-Type": "application/json", ...corsHeaders } })

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!
      const serviceKey = Deno.env.get("N9_SERVICE_ROLE_KEY")!

      // We can't execute arbitrary SQL via supabase-js, but we CAN
      // use the service_role key to access the table directly.
      // So let's just read from the table with the service key via Edge Function
      // and return the result. We'll replace the broken RPC with this function
      // in the Angular code.
      
      // Actually, let me just use PostgREST with service_role to do a raw query
      // The service_role can access the /rest/v1/ endpoint without RLS restrictions
      const res = await fetch(`${supabaseUrl}/rest/v1/gateway_whitelist?select=id,ip_address,label,created_at&order=created_at.desc`, {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        }
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
