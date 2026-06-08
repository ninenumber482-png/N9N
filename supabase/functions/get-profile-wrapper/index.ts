import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  "https://app.mynumber9.uk",
  "https://master.number9-app.pages.dev",
  "https://number9-app.pages.dev",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:5178",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  if (req.method !== "POST") {
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

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, display_name, email, phone, country, role, account_status, registration_status, login_status, kyc_status, referral_code, referred_by, bank_name, bank_account_number, bank_account_name, created_at, approved_at')
      .eq('session_token', tokenHash)
      .gt('session_expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !user) {
      return new Response(JSON.stringify({ error: "INVALID_SESSION" }), {
        status: 401,
        headers: corsHeaders(req),
      });
    }

    return new Response(JSON.stringify({
      uuid: user.id,
      username: user.username,
      displayName: user.display_name,
      email: user.email,
      phone: user.phone,
      country: user.country,
      role: user.role,
      accountStatus: user.account_status,
      registrationStatus: user.registration_status,
      loginStatus: user.login_status,
      kycStatus: user.kyc_status,
      referralCode: user.referral_code,
      referredByCode: user.referred_by,
      bankName: user.bank_name,
      bankAccountNumber: user.bank_account_number,
      bankAccountName: user.bank_account_name,
      createdAt: user.created_at,
      approvedAt: user.approved_at,
    }), {
      status: 200,
      headers: corsHeaders(req),
    });

  } catch (error) {
    console.error('[get-profile-wrapper]', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders(req),
    });
  }
});
