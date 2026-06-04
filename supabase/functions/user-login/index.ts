import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'
import bcrypt from 'npm:bcryptjs@2.4.3'

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ALLOWED_ORIGINS = ["https://app.mynumber9.uk", "http://localhost:5175"];

export default {
  fetch: async (req: Request) => {
    const origin = req.headers.get("origin") || "";
    const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    const ch = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...ch } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ch });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    try {
      const { username, password } = await req.json();
      if (!username || !password) return json({ error: "Missing username or password" }, 400);

      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY')
      if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfiguration' }, 500)

      const supabase = createClient(supabaseUrl, serviceRoleKey)

      const { data: user, error: userErr } = await supabase
        .from('users')
        .select('id, username, display_name, email, phone, role, registration_status, login_status, password_hash')
        .eq('username', username.trim().toLowerCase())
        .single()

      if (userErr || !user) return json({ error: 'Invalid username or password' }, 401)

      const passwordOk = await bcrypt.compare(password, user.password_hash || '')
      if (!passwordOk) return json({ error: 'Invalid username or password' }, 401)

      if (user.registration_status !== 'APPROVED') {
        return json({ error: 'Account not approved yet', pending: true, display_name: user.display_name }, 403)
      }
      if (user.login_status === 'LOCKED' || user.login_status === 'SUSPENDED') {
        return json({ error: 'Account is ' + user.login_status.toLowerCase() }, 403)
      }

      const sessionToken = crypto.getRandomValues(new Uint8Array(32))
        .reduce((a, b) => a + (b < 16 ? '0' : '') + b.toString(16), '');
      const EXPIRY_DAYS = 30;
      const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400000).toISOString()
      const now = new Date().toISOString()
      const ip_address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('host') || ''
      const browser_info = req.headers.get('user-agent') || ''
      const tokenHash = await sha256(sessionToken);

      const { error: sessionErr } = await supabase.from('sessions').insert({
        user_id: user.id, token_hash: tokenHash, ip_address, browser_info, last_activity: now, expires_at: expiresAt,
      })
      if (sessionErr) console.error('[USER-LOGIN] Failed to insert session:', sessionErr.message)

      const { error: updateErr } = await supabase.from('users').update({ session_token: tokenHash, session_expires_at: expiresAt }).eq('id', user.id)
      if (updateErr) return json({ error: 'Failed to create session' }, 500)

      return json({
        success: true,
        user: { id: user.id, username: user.username, display_name: user.display_name, email: user.email, phone: user.phone, role: user.role },
        session: { access_token: sessionToken, expires_at: expiresAt },
      })
    } catch (error) {
      console.error("[USER-LOGIN] Exception:", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
};
