import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  "https://app.mynumber9.uk",
  "https://master.number9-app.pages.dev",
  "https://458d4c28.number9-app.pages.dev",
  // *.number9-app.pages.dev
  // *.number9-admin.pages.dev
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:5178",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.number9-app.pages.dev') || origin.endsWith('.number9-admin.pages.dev') ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-token",
    "Access-Control-Allow-Credentials": "true",
  };
}

async function sha256hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders(req),
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const userToken = req.headers.get('x-user-token');

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: corsHeaders(req),
      });
    }

    if (!userToken) {
      return new Response(JSON.stringify({ error: "NO_TOKEN" }), {
        status: 401,
        headers: corsHeaders(req),
      });
    }

    const tokenHash = await sha256hex(userToken);
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get user from session token
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, role')
      .eq('session_token', tokenHash)
      .gt('session_expires_at', new Date().toISOString())
      .maybeSingle();

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "INVALID_SESSION" }), {
        status: 401,
        headers: corsHeaders(req),
      });
    }

    const userId = user.id;

    // Also support GET with query param or POST with body for userId override (admin use)
    let targetUserId = userId;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.userId && user.role === 'admin') {
          targetUserId = body.userId;
        }
      } catch {}
    } else {
      const url = new URL(req.url);
      if (url.searchParams.get('user_id') && user.role === 'admin') {
        targetUserId = url.searchParams.get('user_id')!;
      }
    }

    // Get wallet data
    const { data: walletRow, error: walletErr } = await supabase
      .from('wallet')
      .select('total_deposited')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (walletErr) {
      return new Response(JSON.stringify({ error: walletErr.message }), {
        status: 500,
        headers: corsHeaders(req),
      });
    }

    const totalDeposited = Number(walletRow?.total_deposited ?? 0);

    // Get deposit locks
    const { data: lockRows, error: locksErr } = await supabase
      .from('deposit_locks')
      .select('amount,turnover_required,turnover_applied,created_at')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: true });

    if (locksErr) {
      return new Response(JSON.stringify({ error: locksErr.message }), {
        status: 500,
        headers: corsHeaders(req),
      });
    }

    if (!lockRows || lockRows.length === 0) {
      return new Response(JSON.stringify({
        required: 0,
        achieved: 0,
        remaining: 0,
        pct: 100,
        totalDeposited,
        locks: [],
        isUnlocked: true,
      }), {
        status: 200,
        headers: corsHeaders(req),
      });
    }

    const locks = (lockRows || []).map(r => {
      const required = Number(r.turnover_required);
      const applied = Math.min(Number(r.turnover_applied), required);
      const remaining = Math.max(0, required - applied);
      return {
        amount: Number(r.amount),
        required,
        applied,
        remaining,
        pct: required > 0 ? Math.min(100, Math.round((applied / required) * 100)) : 100,
        done: remaining <= 0,
      };
    });

    const outstanding = locks.filter(l => !l.done);
    const required = outstanding.reduce((s, l) => s + l.required, 0);
    const achieved = outstanding.reduce((s, l) => s + l.applied, 0);
    const remaining = Math.max(0, required - achieved);
    const pct = required > 0 ? Math.min(100, Math.round((achieved / required) * 100)) : 100;

    return new Response(JSON.stringify({
      required,
      achieved,
      remaining,
      pct,
      totalDeposited,
      locks,
      isUnlocked: remaining <= 0,
    }), {
      status: 200,
      headers: corsHeaders(req),
    });

  } catch (error) {
    console.error('[get-turnover-summary]', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders(req),
    });
  }
});