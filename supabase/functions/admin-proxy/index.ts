import { createClient } from 'jsr:@supabase/supabase-js@2'

// Simple in-memory rate limiter (best-effort across edge function instances)
const rateLimit = new Map<string, { count: number; resetAt: number }>()
const MAX_REQUESTS = 120 // per minute per token
const WINDOW_MS = 60000

function checkRateLimit(token: string): boolean {
  const now = Date.now()
  const entry = rateLimit.get(token)
  if (!entry || now > entry.resetAt) {
    rateLimit.set(token, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_REQUESTS) return false
  entry.count++
  return true
}

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://admin.mynumber9.uk",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Expose-Headers": "content-range",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  // Read session token from custom header (not Authorization, which
  // Supabase gateway validates as JWT). The Angular admin app sends
  // the real session token here; Authorization carries the anon key
  // to satisfy the gateway.
  const token = req.headers.get('x-session-token') || ''

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // Rate limiting (keyed by user token)
  if (!checkRateLimit(token)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // Validate session by token_hash (compare hashed token)
  const tokenHash = await sha256(token);

  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select('id, user_id, logged_out_at, last_activity, expires_at')
    .eq('token_hash', tokenHash)
    .single()

  if (sessionErr || !session || session.logged_out_at) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const now = new Date()
  if (session.expires_at && new Date(session.expires_at) < now) {
    return new Response(JSON.stringify({ error: 'Session expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // Sliding window: update last_activity
  await supabase
    .from('sessions')
    .update({ last_activity: now.toISOString() })
    .eq('id', session.id)

  let payload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const { method, path, body, prefer } = payload

  if (!method || !path) {
    return new Response(JSON.stringify({ error: 'Missing method or path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // Pagination safety: enforce limit on GET requests without explicit pagination
  let safePath = path
  if (method === 'GET' && !path.includes('limit=') && !path.includes('range=') && !path.startsWith('/rpc/')) {
    const sep = path.includes('?') ? '&' : '?'
    safePath = `${path}${sep}limit=100`
  }

  // Path allowlist — restrict to known tables and rpc endpoints
  const ALLOWED_PREFIXES = [
    '/users', '/wallet', '/transactions', '/bets',
    '/king_results', '/king_planned', '/platform_accounts',
    '/kyc_documents', '/referrals', '/sessions',
    '/audit_log', '/rpc/',
    '/platform_config', '/security_alerts', '/failed_logins',
    '/transaction_audit', '/user_audit', '/metrics',
    '/deposit_locks', '/engine_status',
  ]
  const pathAllowed = ALLOWED_PREFIXES.some(p => path.startsWith(p))
  if (!pathAllowed) {
    return new Response(JSON.stringify({ error: 'Access denied: path not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const target = `${supabaseUrl}/rest/v1${safePath}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
  }
  if (prefer) headers['Prefer'] = prefer

  const proxyRes = await fetch(target, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const responseHeaders: Record<string, string> = {
    'Content-Type': proxyRes.headers.get('Content-Type') || 'application/json',
    ...corsHeaders,
  }
  const contentRange = proxyRes.headers.get('content-range')
  if (contentRange) responseHeaders['content-range'] = contentRange

  // Audit log (fire-and-forget)
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('host') || ''
  supabase.from('audit_log').insert({
    admin_id: session.user_id,
    action: `${method} ${path.slice(0, 80)}`,
    resource_type: 'admin_proxy',
    resource_id: session.id,
    ip_address: ip,
    created_at: now.toISOString(),
  }).then(({ error }) => {
    if (error) console.warn('[admin-proxy] audit log failed:', error.message)
  })

  return new Response(proxyRes.body, {
    status: proxyRes.status,
    headers: responseHeaders,
  })
})
