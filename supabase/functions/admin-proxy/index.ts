import { createClient } from 'jsr:@supabase/supabase-js@2';

// Simple in-memory rate limiter (best-effort across edge function instances)
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS = 120; // per minute per token
const WINDOW_MS = 60000;

function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(token);
  if (!entry || now > entry.resetAt) {
    rateLimit.set(token, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const ALLOWED_ORIGINS = [
  'https://admin.mynumber9.uk',
  'https://number9-admin.pages.dev',
  'https://master.number9-admin.pages.dev',
  'http://localhost:4200',
  'http://localhost:4201',
];

function corsOrigin(req: Request): string {
  const o = req.headers.get('origin') || '';
  return ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0];
}

function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': corsOrigin(req),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token, prefer',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'content-range',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  // Read session token: header first (fresh from login), cookie fallback
  const token = (() => {
    const headerToken = req.headers.get('x-session-token') || '';
    if (headerToken) return headerToken;
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/n9_session=([^;]+)/);
    if (match) return match[1];
    return '';
  })();

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  // Rate limiting (keyed by user token)
  if (!checkRateLimit(token)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Validate session — try SHA256(token) first (new format), then raw token (legacy format)
  const tokenHash = await sha256(token);
  const debugHash = tokenHash.slice(0, 8);

  let sessionUserId: string | null = null;
  let sessionId: string | null = null;
  let sessionMfaVerified = false;

  // Helper: lookup in users table by session_token value
  async function lookupUser(value: string) {
    return supabase.from('users').select('id, session_expires_at').eq('session_token', value).maybeSingle();
  }

  // Helper: lookup in sessions table by token_hash value
  async function lookupSession(value: string) {
    return supabase
      .from('sessions')
      .select('id, user_id, logged_out_at, last_activity, expires_at, mfa_verified_at')
      .eq('token_hash', value)
      .maybeSingle();
  }

  // Try all four combinations: (hash|raw) x (users|sessions)
  const candidates = [tokenHash, token];
  for (const candidate of candidates) {
    // 1) users.session_token
    const { data: userRow, error: userErr } = await lookupUser(candidate);
    if (!userErr && userRow) {
      if (userRow.session_expires_at && new Date(userRow.session_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: 'Session expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        });
      }
      sessionUserId = userRow.id;
      sessionId = 'users-table';
      // Upgrade raw token to hash if needed
      if (candidate === token && token !== tokenHash) {
        const expiresAt = userRow.session_expires_at || new Date(Date.now() + 7 * 86400_000).toISOString();
        supabase
          .from('users')
          .update({ session_token: tokenHash })
          .eq('id', userRow.id)
          .then(() => {});
      }
      break;
    }

    // 2) sessions.token_hash
    const { data: session, error: sessionErr } = await lookupSession(candidate);
    if (!sessionErr && session && !session.logged_out_at) {
      const now = new Date();
      if (session.expires_at && new Date(session.expires_at) < now) {
        return new Response(JSON.stringify({ error: 'Session expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        });
      }
      sessionUserId = session.user_id;
      sessionId = session.id;
      sessionMfaVerified = !!session.mfa_verified_at;
      // Upgrade raw token to hash if needed
      if (candidate === token && token !== tokenHash) {
        supabase
          .from('sessions')
          .update({ token_hash: tokenHash })
          .eq('id', session.id)
          .then(() => {});
      }
      await supabase.from('sessions').update({ last_activity: now.toISOString() }).eq('id', session.id);
      break;
    }
  }

  if (!sessionUserId) {
    console.error(`[ADMIN-PROXY] SESSION NOT FOUND — hash:${debugHash} rawLen:${token.length}`);
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  // MFA gate for admin sessions
  const { data: mfaUser } = await supabase
    .from('users')
    .select('role, totp_enabled, totp_skipped_at')
    .eq('id', sessionUserId)
    .maybeSingle();

  if (mfaUser && (mfaUser.role === 'admin' || mfaUser.role === 'superadmin')) {
    if (!sessionMfaVerified && sessionId !== 'users-table') {
      if (mfaUser.totp_enabled) {
        return new Response(JSON.stringify({ error: 'MFA verification required', code: 'MFA_REQUIRED' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        });
      }
      if (!mfaUser.totp_skipped_at) {
        return new Response(JSON.stringify({ error: 'MFA setup required', code: 'MFA_SETUP_REQUIRED' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        });
      }
    }
    // users-table legacy path: check latest open session MFA state
    if (sessionId === 'users-table') {
      const { data: latestSession } = await supabase
        .from('sessions')
        .select('mfa_verified_at, id')
        .eq('user_id', sessionUserId)
        .is('logged_out_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      sessionMfaVerified = !!latestSession?.mfa_verified_at;
      if (!sessionMfaVerified) {
        if (mfaUser.totp_enabled) {
          return new Response(JSON.stringify({ error: 'MFA verification required', code: 'MFA_REQUIRED' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
          });
        }
        if (!mfaUser.totp_skipped_at) {
          return new Response(JSON.stringify({ error: 'MFA setup required', code: 'MFA_SETUP_REQUIRED' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
          });
        }
      }
    }
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const { method, path, body, prefer } = payload;

  if (!method || !path) {
    return new Response(JSON.stringify({ error: 'Missing method or path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  // Pagination safety: enforce limit on GET requests without explicit pagination
  let safePath = path;
  if (method === 'GET' && !path.includes('limit=') && !path.includes('range=') && !path.startsWith('/rpc/')) {
    const sep = path.includes('?') ? '&' : '?';
    safePath = `${path}${sep}limit=100`;
  }

  // Path allowlist — restrict to known tables and rpc endpoints
  const ALLOWED_PREFIXES = [
    '/users',
    '/wallet',
    '/transactions',
    '/bets',
    '/king_results',
    '/king_planned',
    '/platform_accounts',
    '/kyc_documents',
    '/referrals',
    '/sessions',
    '/audit_log',
    '/platform_config',
    '/security_alerts',
    '/failed_logins',
    '/transaction_audit',
    '/user_audit',
    '/metrics',
    '/deposit_locks',
    '/engine_status',
    '/popup_banners',
    '/n9_users',
  ];

  // Explicit RPC allowlist — no wildcard
  const ALLOWED_RPCS = new Set([
    'approve_deposit',
    'reject_deposit',
    'approve_withdrawal',
    'reject_withdrawal',
    'approve_user',
    'reject_user',
    'admin_reset_password',
    'verify_password',
    'admin_adjust_balance',
    'settle_session',
    'generate_referral_code',
    'log_admin_action',
    'get_kyc_documents_admin_list',
    'get_kyc_documents_by_user',
    'get_kyc_document_url',
    'count_kyc_by_status',
    'add_allowed_ip',
    'remove_allowed_ip',
    'is_ip_allowed',
    'get_allowed_ips',
    'create_popup_banner',
    'update_popup_banner',
    'delete_popup_banner',
    'check_rate_limit',
    'log_failed_login',
    'get_platform_stats',
    'admin_reset_turnover',
    'admin_adjust_turnover',
  ]);

  const pathAllowed =
    ALLOWED_PREFIXES.some((p) => path.startsWith(p)) ||
    (path.startsWith('/rpc/') && ALLOWED_RPCS.has(path.replace('/rpc/', '').split('?')[0]));
  if (!pathAllowed) {
    return new Response(JSON.stringify({ error: 'Access denied: path not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
    });
  }

  const target = `${supabaseUrl}/rest/v1${safePath}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  if (prefer) headers['Prefer'] = prefer;

  const proxyRes = await fetch(target, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseHeaders: Record<string, string> = {
    'Content-Type': proxyRes.headers.get('Content-Type') || 'application/json',
    ...corsHeaders(req),
  };
  const contentRange = proxyRes.headers.get('content-range');
  if (contentRange) responseHeaders['content-range'] = contentRange;

  // Audit log (fire-and-forget)
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('host') || '';
  supabase
    .from('audit_log')
    .insert({
      admin_id: sessionUserId,
      action: `${method} ${path.slice(0, 80)}`,
      resource_type: 'admin_proxy',
      resource_id: sessionId || 'cookie-fallback',
      ip_address: ip,
      created_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.warn('[admin-proxy] audit log failed:', error.message);
    });

  return new Response(proxyRes.body, {
    status: proxyRes.status,
    headers: responseHeaders,
  });
});
