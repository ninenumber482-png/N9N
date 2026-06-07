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

const SESSION_DAYS = 7;
const COOKIE_NAME = "n9_session";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 900_000; // 15 minutes

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://admin.mynumber9.uk",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Credentials": "true",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extra },
  });

function setSessionCookie(token: string, maxAgeSec: number): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAgeSec}`;
}

console.info("NUMBER9 Auth Login Function Started");

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      const { username, password, email }: LoginPayload = await req.json();

      if (!username || !password || !email) {
        return json({ error: "Missing required fields: username, password, email" }, 400);
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY')
      if (!supabaseUrl || !serviceRoleKey) {
        return json({ error: 'Server misconfiguration' }, 500)
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey)
      const ip_address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('host') || ''
      const dbUsername = username.toLowerCase().trim()

      // ── Rate limiting ──
      const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const { count } = await supabase
        .from('failed_logins')
        .select('id', { count: 'exact', head: true })
        .eq('username', dbUsername)
        .gte('attempted_at', cutoff);

      if ((count || 0) >= RATE_LIMIT_MAX) {
        return json({ error: 'Too many failed attempts. Try again later.' }, 429, { "Retry-After": "900" });
      }

      // Query both tables — no account_status filter for admins (they bypass member checks)
      const [uRow, n9Row] = await Promise.all([
        supabase.from('users').select('id, username, display_name, role, account_status, password_hash, email')
          .eq('username', dbUsername).eq('role', 'admin').neq('login_status', 'SUSPENDED').maybeSingle(),
        supabase.from('n9_users').select('id, username, password_hash, role')
          .eq('username', dbUsername).eq('role', 'admin').maybeSingle(),
      ]);

      const uData = uRow.data;
      const n9Data = n9Row.data;

      const hashes = new Set<string>();
      if (uData?.password_hash) hashes.add(uData.password_hash);
      if (n9Data?.password_hash) hashes.add(n9Data.password_hash);

      let matchedHash: string | null = null;
      for (const h of hashes) {
        if (bcrypt.compareSync(password, h)) {
          matchedHash = h;
          break;
        }
      }

      if (!matchedHash) {
        try { await supabase.from('failed_logins').insert({ username: dbUsername, ip_address, reason: 'wrong_password' }) } catch {}
        console.warn(`[SECURITY] Login attempt with wrong password: ${dbUsername}`);
        return json({ error: "Invalid username or password" }, 401);
      }

      let userRow: Record<string, any> | null = null;
      if (uData) {
        userRow = uData;
      } else if (n9Data) {
        userRow = { ...n9Data, display_name: n9Data.username, email: '', account_status: 'ACTIVE' };
      } else {
        return json({ error: "Invalid username or password" }, 401);
      }

      // ── Create session ──
      const sessionToken = crypto.getRandomValues(new Uint8Array(32))
        .reduce((a, b) => a + (b < 16 ? '0' : '') + b.toString(16), '');

      const now = new Date().toISOString()
      const maxAgeSec = SESSION_DAYS * 86400;
      const expiresAt = new Date(Date.now() + maxAgeSec * 1000).toISOString()
      const tokenHash = await sha256(sessionToken);

      // Clear failed logins
      try { await supabase.from('failed_logins').delete().eq('username', dbUsername).eq('ip_address', ip_address) } catch {}

      // Try inserting session record (may fail if user is only in n9_users and FK fails)
      const { error: sessionErr } = await supabase.from('sessions').insert({
        user_id: userRow.id,
        token_hash: tokenHash,
        ip_address,
        browser_info: req.headers.get('user-agent') || 'admin-dashboard',
        last_activity: now,
        expires_at: expiresAt,
      })
      if (sessionErr) {
        // Log but don't fail — will fall back to users.session_token lookup in admin-proxy
        console.warn('[LOGIN] sessions insert failed (will use users.session_token fallback):', sessionErr.message)
      }

      // Always update users.session_token so admin-proxy can find the session
      const { error: userUpdateErr } = await supabase
        .from('users')
        .update({ session_token: tokenHash, session_expires_at: expiresAt })
        .eq('id', userRow.id)

      if (userUpdateErr) {
        console.warn(`[LOGIN] users.session_token update failed: ${userUpdateErr.message}`)
        // Upsert fallback: admin may only be in n9_users, create a minimal users row
        const { error: upsertErr } = await supabase
          .from('users')
          .upsert({
            id: userRow.id,
            username: dbUsername,
            display_name: userRow.display_name || dbUsername,
            role: 'admin',
            account_status: 'ACTIVE',
            login_status: 'ACTIVE',
            registration_status: 'APPROVED',
            session_token: tokenHash,
            session_expires_at: expiresAt,
          }, { onConflict: 'id' })
        if (upsertErr) {
          // Both failed — can't create any session record
          console.error('[LOGIN] All session storage attempts failed:', upsertErr.message)
          return json({ error: 'Failed to create session' }, 500)
        }
        console.info('[LOGIN] Created admin row in users via upsert')
      }

      console.info(`[LOGIN] Session created for ${dbUsername}: ${sessionToken.slice(0, 8)}...`);

      const cookie = setSessionCookie(sessionToken, maxAgeSec);
      return json({
        success: true,
        token: sessionToken,
        user: {
          id: userRow.id,
          email: userRow.email || '',
          username: dbUsername,
          role: userRow.role,
          isNewAccount: false,
        },
        message: "Login successful",
      }, 200, { "Set-Cookie": cookie });

    } catch (error) {
      console.error("[ERROR] Login exception:", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
};
