// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'
import bcrypt from 'npm:bcryptjs@2.4.3'

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface LoginPayload {
  username: string;
  password: string;
  email: string;
}

// CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://admin.mynumber9.uk",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

console.info("NUMBER9 Auth Login Function Started");

export default {
  fetch: async (req: Request) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only allow POST
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      const { username, password, email }: LoginPayload = await req.json();

      // Validate input
      if (!username || !password || !email) {
        return json({ error: "Missing required fields: username, password, email" }, 400);
      }

      // Setup Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY')
      if (!supabaseUrl || !serviceRoleKey) {
        return json({ error: 'Server misconfiguration' }, 500)
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey)

      // Look up admin user in database
      const dbUsername = username.toLowerCase().trim()
      let userRow: Record<string, any> | null = null;

      // Query both tables and collect password hashes to check
      const [uRow, n9Row] = await Promise.all([
        supabase.from('users').select('id, username, display_name, role, account_status, password_hash, email')
          .eq('username', dbUsername).eq('role', 'admin').eq('account_status', 'ACTIVE').neq('login_status', 'SUSPENDED').maybeSingle(),
        supabase.from('n9_users').select('id, username, password_hash, role')
          .eq('username', dbUsername).eq('role', 'admin').maybeSingle(),
      ]);

      const uData = uRow.data;
      const n9Data = n9Row.data;

      // Collect all candidate password hashes
      const hashes = new Set<string>();
      if (uData?.password_hash) hashes.add(uData.password_hash);
      if (n9Data?.password_hash) hashes.add(n9Data.password_hash);

      // Check if any hash matches
      let matchedHash: string | null = null;
      for (const h of hashes) {
        if (bcrypt.compareSync(password, h)) {
          matchedHash = h;
          break;
        }
      }

      if (!matchedHash) {
        console.warn(`[SECURITY] Login attempt with unknown admin: ${username}`);
        return json({ error: "Invalid username or password" }, 401);
      }

      // Build userRow — always prefer users table record for FK compatibility
      if (uData) {
        userRow = uData;
      } else if (n9Data) {
        userRow = { ...n9Data, display_name: n9Data.username, email: '', account_status: 'ACTIVE' };
      } else {
        console.warn(`[SECURITY] Login attempt with unknown admin: ${username}`);
        return json({ error: "Invalid username or password" }, 401);
      }

      // Generate session token
      const sessionToken = crypto.getRandomValues(new Uint8Array(32))
        .reduce((a, b) => a + (b < 16 ? '0' : '') + b.toString(16), '');

      // Insert session record
      const now = new Date().toISOString()
      const expiresAt = new Date(Date.now() + 86400000).toISOString()
      const tokenHash = await sha256(sessionToken);

      const { error: sessionErr } = await supabase.from('sessions').insert({
        user_id: userRow.id,
        token_hash: tokenHash,
        ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('host') || '',
        browser_info: req.headers.get('user-agent') || 'admin-dashboard',
        last_activity: now,
        expires_at: expiresAt,
      })

      if (sessionErr) {
        console.error('[LOGIN] Failed to insert session:', sessionErr.message)
        return json({ error: 'Failed to create session' }, 500)
      }

      console.info(`[LOGIN] Session created for ${dbUsername}: ${sessionToken.slice(0, 8)}...`);

      return json({
        success: true,
        user: {
          id: userRow.id,
          email: userRow.email || '',
          username: dbUsername,
          role: userRow.role,
          isNewAccount: false,
        },
        session: {
          access_token: sessionToken,
        },
        message: "Login successful",
      });

    } catch (error) {
      console.error("[ERROR] Login exception:", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
};
