import { createClient } from 'jsr:@supabase/supabase-js@2'

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ALLOWED_ORIGINS = ["https://app.mynumber9.uk", "https://mynumber9.uk"];

function corsOrigin(req: Request): string {
  const o = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0];
}

const corsHeaders = (req?: Request) => {
  const origin = req ? corsOrigin(req) : ALLOWED_ORIGINS[0];
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
};

let bcryptCache: any = null;
async function getBcrypt() {
  if (!bcryptCache) {
    bcryptCache = await import('npm:bcryptjs@2.4.3');
  }
  return bcryptCache.default || bcryptCache;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders(req) });

  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ error: "Missing username or password" }), { status: 400, headers: corsHeaders(req) });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500, headers: corsHeaders(req) });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const ip_address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('host') || ''

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, username, display_name, email, phone, role, registration_status, login_status, password_hash, country, bank_name, bank_account_number, bank_account_name, created_at')
      .eq('username', username.trim().toLowerCase())
      .maybeSingle()

    if (userErr || !user) {
      try { await supabase.from('failed_logins').insert({ username: username.trim().toLowerCase(), ip_address, reason: 'user_not_found' }) } catch {}
      return new Response(JSON.stringify({ error: 'Invalid username or password' }), { status: 401, headers: corsHeaders(req) });
    }

    const bcrypt = await getBcrypt();
    const passwordOk = await bcrypt.compare(password, user.password_hash || '')
    if (!passwordOk) {
      try { await supabase.from('failed_logins').insert({ username: username.trim().toLowerCase(), ip_address, reason: 'wrong_password' }) } catch {}
      return new Response(JSON.stringify({ error: 'Invalid username or password' }), { status: 401, headers: corsHeaders(req) });
    }

    if (user.registration_status !== 'APPROVED') {
      return new Response(JSON.stringify({ error: 'Account not approved yet', pending: true, display_name: user.display_name }), { status: 403, headers: corsHeaders(req) });
    }
    if (user.login_status === 'LOCKED' || user.login_status === 'SUSPENDED') {
      return new Response(JSON.stringify({ error: 'Account is ' + user.login_status.toLowerCase() }), { status: 403, headers: corsHeaders(req) });
    }

    const sessionToken = crypto.randomUUID().replace(/-/g, '');
    const EXPIRY_DAYS = 30;
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400000).toISOString()
    const now = new Date().toISOString()
    const browser_info = req.headers.get('user-agent') || ''
    const tokenHash = await sha256(sessionToken);

    const { error: sessionErr } = await supabase.from('sessions').insert({
      user_id: user.id, token_hash: tokenHash, ip_address, browser_info, last_activity: now, expires_at: expiresAt,
    })
    if (sessionErr) console.error('[USER-LOGIN] Failed to insert session:', sessionErr.message)

    const { error: updateErr } = await supabase.from('users').update({ session_token: tokenHash, session_expires_at: expiresAt }).eq('id', user.id)
    if (updateErr) {
      return new Response(JSON.stringify({ error: 'Failed to create session' }), { status: 500, headers: corsHeaders(req) });
    }

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        country: user.country,
        bank_name: user.bank_name,
        bank_account_number: user.bank_account_number,
        bank_account_name: user.bank_account_name,
        created_at: user.created_at,
      },
      session: {
        access_token: sessionToken,
        expires_at: expiresAt,
      },
    }), { status: 200, headers: corsHeaders(req) });

  } catch (error) {
    console.error("[USER-LOGIN] Exception:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: corsHeaders(req),
    });
  }
});
