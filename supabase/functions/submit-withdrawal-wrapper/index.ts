import { createClient } from 'jsr:@supabase/supabase-js@2'

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ALLOWED_ORIGINS = [
  "https://app.mynumber9.uk",
  "https://master.number9-app.pages.dev",
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-token",
    "Access-Control-Allow-Credentials": "true",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders(req) });

  try {
    const { p_user_id, p_amount, p_method, p_bank_name, p_bank_account_number, p_bank_account_name, p_idempotency_key } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const userToken = req.headers.get('x-user-token');

    if (!supabaseUrl || !serviceKey || !userToken) {
      return new Response(JSON.stringify({ error: "Missing configuration" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate the user's session token
    const tokenHash = await sha256(userToken);
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('session_token', tokenHash)
      .gt('session_expires_at', new Date().toISOString())
      .single();

    if (userErr || !user || user.id !== p_user_id) {
      return new Response(JSON.stringify({ error: "Sesi habis, silakan login ulang." }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      });
    }

    // Call RPC with service_role (bypasses x-user-token check in RPC)
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_withdrawal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        p_user_id,
        p_amount,
        p_method,
        p_bank_name,
        p_bank_account_number,
        p_bank_account_name,
        p_idempotency_key,
      }),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  } catch (error) {
    console.error('[submit-withdrawal-wrapper]', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }
});
