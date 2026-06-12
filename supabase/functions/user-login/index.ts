import { createClient } from 'jsr:@supabase/supabase-js@2';

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const ALLOWED_ORIGINS = [
  'https://app.mynumber9.uk',
  'https://mynumber9.uk',
  'https://number9-app.pages.dev',
  'https://number9-admin.pages.dev',
  'https://*.number9-app.pages.dev',
  'https://*.number9-admin.pages.dev',
  'https://master.number9-app.pages.dev',
  'https://master.number9-admin.pages.dev',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:4200',
  'http://localhost:4201',
];

function corsOrigin(req: Request): string {
  const o = req.headers.get('origin') || '';
  if (ALLOWED_ORIGINS.includes(o)) return o;
  if (o.endsWith('.number9-app.pages.dev') || o.endsWith('.number9-admin.pages.dev')) return o;
  return ALLOWED_ORIGINS[0];
}

const corsHeaders = (req?: Request, extra: Record<string, string> = {}) => {
  const origin = req ? corsOrigin(req) : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
    ...extra,
  };
};

const SESSION_DAYS = 7;
const COOKIE_NAME = 'n9_session';
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 900_000; // 15 minutes

let bcryptCache: any = null;
async function getBcrypt() {
  if (!bcryptCache) {
    bcryptCache = await import('npm:bcryptjs@2.4.3');
  }
  return bcryptCache.default || bcryptCache;
}

async function checkRateLimit(
  supabase: any,
  username: string,
  ip: string,
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from('failed_logins')
    .select('id', { count: 'exact', head: true })
    .eq('username', username)
    .eq('ip_address', ip)
    .gte('attempted_at', cutoff);

  if ((count || 0) >= RATE_LIMIT_MAX) {
    const { data: last } = await supabase
      .from('failed_logins')
      .select('attempted_at')
      .eq('username', username)
      .eq('ip_address', ip)
      .order('attempted_at', { ascending: false })
      .limit(1)
      .single();
    const retryAfter = last
      ? Math.ceil((new Date(last.attempted_at).getTime() + RATE_LIMIT_WINDOW_MS - Date.now()) / 1000)
      : 900;
    return { allowed: false, retryAfter: Math.max(retryAfter, 60) };
  }
  return { allowed: true };
}

function setSessionCookie(token: string, maxAgeSec: number): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAgeSec}`;
}

interface GeoInfo {
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
  isp?: string;
}

function isPrivateIp(ip: string): boolean {
  if (!ip || ip === '::1') return true;
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return false;
}

async function resolveGeo(ip: string): Promise<GeoInfo | null> {
  if (isPrivateIp(ip)) return null;
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp`,
      { signal: AbortSignal.timeout(3500) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'success') return null;
    return {
      city: data.city || undefined,
      region: data.regionName || undefined,
      country: data.country || undefined,
      country_code: data.countryCode || undefined,
      isp: data.isp || undefined,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders(req) });

  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return new Response(JSON.stringify({ error: 'Missing username or password' }), {
        status: 400,
        headers: corsHeaders(req),
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
        status: 500,
        headers: corsHeaders(req),
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const ip_address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('host') || '';
    const uname = username.trim().toLowerCase();

    // ── Rate limiting ──
    const rl = await checkRateLimit(supabase, uname, ip_address);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: `Too many failed attempts. Try again in ${rl.retryAfter}s.` }), {
        status: 429,
        headers: corsHeaders(req, { 'Retry-After': String(rl.retryAfter) }),
      });
    }

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select(
        'id, username, display_name, email, phone, role, registration_status, login_status, password_hash, country, created_at, bank_name, bank_account_number, bank_account_name',
      )
      .eq('username', uname)
      .maybeSingle();

    if (userErr || !user) {
      try {
        await supabase.from('failed_logins').insert({ username: uname, ip_address, reason: 'user_not_found' });
      } catch {}
      return new Response(JSON.stringify({ error: 'Invalid username or password' }), {
        status: 401,
        headers: corsHeaders(req),
      });
    }

    const bcrypt = await getBcrypt();
    const passwordOk = await bcrypt.compare(password, user.password_hash || '');
    if (!passwordOk) {
      try {
        await supabase.from('failed_logins').insert({ username: uname, ip_address, reason: 'wrong_password' });
      } catch {}
      return new Response(JSON.stringify({ error: 'Invalid username or password' }), {
        status: 401,
        headers: corsHeaders(req),
      });
    }

    if (user.registration_status !== 'APPROVED') {
      return new Response(
        JSON.stringify({ error: 'Account not approved yet', pending: true, display_name: user.display_name }),
        { status: 403, headers: corsHeaders(req) },
      );
    }
    if (user.login_status === 'LOCKED' || user.login_status === 'SUSPENDED') {
      return new Response(JSON.stringify({ error: 'Account is ' + user.login_status.toLowerCase() }), {
        status: 403,
        headers: corsHeaders(req),
      });
    }

    // ── Create session ──
    const sessionToken = crypto.randomUUID().replace(/-/g, '');
    const maxAgeSec = SESSION_DAYS * 86400;
    const expiresAt = new Date(Date.now() + maxAgeSec * 1000).toISOString();
    const now = new Date().toISOString();
    const browser_info = req.headers.get('user-agent') || '';
    const tokenHash = await sha256(sessionToken);
    const geoInfo = await resolveGeo(ip_address);

    // Clear failed logins for this user
    try {
      await supabase.from('failed_logins').delete().eq('username', uname).eq('ip_address', ip_address);
    } catch {}

    const deviceInfo = geoInfo ? { geo: geoInfo } : null;

    const { error: sessionErr } = await supabase.from('sessions').insert({
      user_id: user.id,
      token_hash: tokenHash,
      ip_address,
      browser_info,
      device_info: deviceInfo,
      geo_info: geoInfo,
      last_activity: now,
      expires_at: expiresAt,
    });
    if (sessionErr) console.error('[USER-LOGIN] Failed to insert session:', sessionErr.message);

    const { error: updateErr } = await supabase
      .from('users')
      .update({
        session_token: tokenHash,
        session_expires_at: expiresAt,
        last_login_ip: ip_address,
        last_login_geo: geoInfo,
      })
      .eq('id', user.id);
    if (updateErr) {
      return new Response(JSON.stringify({ error: 'Failed to create session' }), {
        status: 500,
        headers: corsHeaders(req),
      });
    }

    const cookie = setSessionCookie(sessionToken, maxAgeSec);
    return new Response(
      JSON.stringify({
        success: true,
        token: sessionToken,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
          country: user.country,
          created_at: user.created_at,
          bank_name: user.bank_name || null,
          bank_account_number: user.bank_account_number || null,
          bank_account_name: user.bank_account_name || null,
        },
      }),
      { status: 200, headers: corsHeaders(req, { 'Set-Cookie': cookie }) },
    );
  } catch (error) {
    console.error('[USER-LOGIN] Exception:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: corsHeaders(req),
    });
  }
});
