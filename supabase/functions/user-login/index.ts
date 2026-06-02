import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'
import bcrypt from 'npm:bcryptjs@2.4.3'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      const { username, password } = await req.json();

      if (!username || !password) {
        return json({ error: "Missing username or password" }, 400);
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY')

      if (!supabaseUrl || !serviceRoleKey) {
        return json({ error: 'Server misconfiguration' }, 500)
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey)

      // Look up user by username (exact match)
      const { data: user, error: userErr } = await supabase
        .from('users')
        .select('id, username, display_name, email, phone, role, registration_status, login_status, password_hash')
        .eq('username', username.trim().toLowerCase())
        .single()

      if (userErr || !user) {
        console.warn(`[USER-LOGIN] User not found: ${username}`)
        return json({ error: 'Invalid username or password' }, 401)
      }

      // Verify password with bcrypt
      const passwordOk = await bcrypt.compare(password, user.password_hash || '')
      if (!passwordOk) {
        console.warn(`[USER-LOGIN] Wrong password for: ${username}`)
        return json({ error: 'Invalid username or password' }, 401)
      }

      // Check account status
      if (user.registration_status !== 'APPROVED') {
        return json({ error: 'Account not approved yet', pending: true }, 403)
      }
      if (user.login_status === 'LOCKED') {
        return json({ error: 'Account is locked' }, 403)
      }

      // Generate session token (64-char hex)
      const sessionToken = crypto.getRandomValues(new Uint8Array(32))
        .reduce((a, b) => a + (b < 16 ? '0' : '') + b.toString(16), '');

      const EXPIRY_DAYS = 30;
      const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400000).toISOString()
      const now = new Date().toISOString()

      // Create session record
      const ip_address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('host') || ''
      const browser_info = req.headers.get('user-agent') || ''

      const { error: sessionErr } = await supabase.from('sessions').insert({
        user_id: user.id,
        token_hash: sessionToken,
        ip_address,
        browser_info,
        last_activity: now,
        expires_at: expiresAt,
      })

      if (sessionErr) {
        console.error('[USER-LOGIN] Failed to insert session:', sessionErr.message)
      }

      // Store token on user row
      const { error: updateErr } = await supabase
        .from('users')
        .update({
          session_token: sessionToken,
          session_expires_at: expiresAt,
        })
        .eq('id', user.id)

      if (updateErr) {
        console.error('[USER-LOGIN] Failed to update session token:', updateErr.message)
        return json({ error: 'Failed to create session' }, 500)
      }

      console.info(`[USER-LOGIN] Session created for ${user.username}: ${sessionToken.slice(0, 8)}...`)

      return json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
        session: {
          access_token: sessionToken,
          expires_at: expiresAt,
        },
      })

    } catch (error) {
      console.error("[USER-LOGIN] Exception:", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
}
