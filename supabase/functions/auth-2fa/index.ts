import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { TOTP, Secret } from 'npm:otpauth@9.3.6';

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

const corsHeaders = (req?: Request, extra: Record<string, string> = {}) => {
  const origin = req ? corsOrigin(req) : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
    ...extra,
  };
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}, req?: Request) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(req, extra) });

function readToken(req: Request): string {
  const header = req.headers.get('x-session-token') || '';
  if (header) return header;
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/n9_session=([^;]+)/);
  return match ? match[1] : '';
}

interface SessionCtx {
  userId: string;
  sessionId: string;
  username: string;
  role: string;
}

async function resolveSession(supabase: ReturnType<typeof createClient>, token: string): Promise<SessionCtx | null> {
  if (!token) return null;
  const tokenHash = await sha256(token);
  for (const candidate of [tokenHash, token]) {
    const { data: session } = await supabase
      .from('sessions')
      .select('id, user_id, logged_out_at, expires_at')
      .eq('token_hash', candidate)
      .maybeSingle();
    if (!session || session.logged_out_at) continue;
    if (session.expires_at && new Date(session.expires_at) < new Date()) continue;

    const { data: user } = await supabase
      .from('users')
      .select('id, username, role')
      .eq('id', session.user_id)
      .maybeSingle();
    if (!user) continue;
    return {
      userId: user.id,
      sessionId: session.id,
      username: user.username,
      role: user.role || 'admin',
    };
  }
  return null;
}

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = '';
  for (const b of bytes) out += alphabet[b % 32];
  return out;
}

function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

async function hashBackupCode(code: string): Promise<string> {
  return sha256(code.replace(/-/g, '').toUpperCase());
}

function verifyTotp(secret: string, code: string): boolean {
  const totp = new TOTP({
    issuer: 'NUMBER9 Admin',
    label: 'admin',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
  return delta !== null;
}

async function markSessionMfaVerified(supabase: ReturnType<typeof createClient>, sessionId: string): Promise<void> {
  await supabase.from('sessions').update({ mfa_verified_at: new Date().toISOString() }).eq('id', sessionId);
}

async function consumeBackupCode(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  code: string,
): Promise<boolean> {
  const { data: user } = await supabase.from('users').select('totp_backup_codes').eq('id', userId).maybeSingle();
  const hashes: string[] = Array.isArray(user?.totp_backup_codes) ? user.totp_backup_codes : [];
  if (!hashes.length) return false;

  const incoming = await hashBackupCode(code);
  const idx = hashes.indexOf(incoming);
  if (idx === -1) return false;

  hashes.splice(idx, 1);
  await supabase.from('users').update({ totp_backup_codes: hashes }).eq('id', userId);
  return true;
}

console.info('NUMBER9 Auth 2FA Function Started');

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, {}, req);
    }

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !serviceRoleKey) {
        return json({ error: 'Server misconfiguration' }, 500, {}, req);
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const token = readToken(req);
      const ctx = await resolveSession(supabase, token);
      if (!ctx) {
        return json({ error: 'Invalid or expired session' }, 401, {}, req);
      }
      if (ctx.role !== 'admin' && ctx.role !== 'superadmin') {
        return json({ error: 'Forbidden' }, 403, {}, req);
      }

      const body = await req.json();
      const action = String(body.action || '');

      if (action === 'status') {
        const { data: user } = await supabase
          .from('users')
          .select('totp_enabled, totp_skipped_at')
          .eq('id', ctx.userId)
          .maybeSingle();
        const { data: session } = await supabase
          .from('sessions')
          .select('mfa_verified_at')
          .eq('id', ctx.sessionId)
          .maybeSingle();

        let phase: 'setup' | 'verify' | 'complete' = 'setup';
        if (user?.totp_enabled) phase = 'verify';
        else if (user?.totp_skipped_at) phase = 'complete';

        return json(
          {
            success: true,
            phase,
            mfaVerified: !!session?.mfa_verified_at,
            totpEnabled: !!user?.totp_enabled,
            totpSkipped: !!user?.totp_skipped_at,
          },
          200,
          {},
          req,
        );
      }

      if (action === 'setup') {
        const secret = generateSecret();
        await supabase.from('users').update({ totp_secret: secret, totp_enabled: false }).eq('id', ctx.userId);

        const label = encodeURIComponent(`NUMBER9 Admin (${ctx.username})`);
        const issuer = encodeURIComponent('NUMBER9 Admin');
        const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`;

        return json({ success: true, secret, uri, qrUrl }, 200, {}, req);
      }

      if (action === 'confirm') {
        const code = String(body.code || '').trim();
        if (!/^\d{6}$/.test(code)) {
          return json({ error: 'Invalid verification code' }, 400, {}, req);
        }

        const { data: user } = await supabase.from('users').select('totp_secret').eq('id', ctx.userId).maybeSingle();
        if (!user?.totp_secret) {
          return json({ error: 'Run setup first' }, 400, {}, req);
        }
        if (!verifyTotp(user.totp_secret, code)) {
          return json({ error: 'Invalid authenticator code' }, 401, {}, req);
        }

        const plainCodes = generateBackupCodes();
        const hashed = await Promise.all(plainCodes.map((c) => hashBackupCode(c)));

        await supabase
          .from('users')
          .update({
            totp_enabled: true,
            totp_skipped_at: null,
            totp_backup_codes: hashed,
          })
          .eq('id', ctx.userId);

        await markSessionMfaVerified(supabase, ctx.sessionId);

        try {
          await supabase.from('audit_log').insert({
            admin_id: ctx.userId,
            action: 'TOTP_ENABLED',
            resource_type: 'users',
            resource_id: ctx.userId,
            ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
          });
        } catch {
          /* non-blocking */
        }

        return json({ success: true, backupCodes: plainCodes, message: '2FA enabled' }, 200, {}, req);
      }

      if (action === 'verify') {
        const code = String(body.code || '').trim();
        const backupCode = String(body.backupCode || '').trim();

        const { data: user } = await supabase
          .from('users')
          .select('totp_secret, totp_enabled, totp_backup_codes')
          .eq('id', ctx.userId)
          .maybeSingle();

        if (!user?.totp_enabled || !user.totp_secret) {
          return json({ error: '2FA not enabled' }, 400, {}, req);
        }

        let ok = false;
        if (/^\d{6}$/.test(code)) {
          ok = verifyTotp(user.totp_secret, code);
        } else if (backupCode) {
          ok = await consumeBackupCode(supabase, ctx.userId, backupCode);
        }

        if (!ok) {
          return json({ error: 'Invalid code' }, 401, {}, req);
        }

        await markSessionMfaVerified(supabase, ctx.sessionId);
        return json({ success: true, message: '2FA verified' }, 200, {}, req);
      }

      if (action === 'skip') {
        await supabase
          .from('users')
          .update({
            totp_skipped_at: new Date().toISOString(),
            totp_enabled: false,
            totp_secret: null,
            totp_backup_codes: null,
          })
          .eq('id', ctx.userId);

        await markSessionMfaVerified(supabase, ctx.sessionId);

        try {
          await supabase.from('audit_log').insert({
            admin_id: ctx.userId,
            action: 'TOTP_SKIPPED',
            resource_type: 'users',
            resource_id: ctx.userId,
            ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
          });
        } catch {
          /* non-blocking */
        }

        return json({ success: true, message: '2FA setup skipped' }, 200, {}, req);
      }

      if (action === 'reset') {
        const targetUserId = String(body.targetUserId || ctx.userId);
        const { data: actor } = await supabase.from('users').select('role').eq('id', ctx.userId).maybeSingle();

        const isSelf = targetUserId === ctx.userId;
        const isSuper = actor?.role === 'superadmin';
        if (!isSelf && !isSuper) {
          return json({ error: 'Only superadmin can reset other admins' }, 403, {}, req);
        }
        if (!isSelf) {
          const { data: actorSession } = await supabase
            .from('sessions')
            .select('mfa_verified_at')
            .eq('id', ctx.sessionId)
            .maybeSingle();
          if (!actorSession?.mfa_verified_at) {
            return json({ error: 'Complete MFA on your session before resetting others' }, 403, {}, req);
          }
        }

        await supabase
          .from('users')
          .update({
            totp_secret: null,
            totp_enabled: false,
            totp_skipped_at: null,
            totp_backup_codes: null,
          })
          .eq('id', targetUserId)
          .in('role', ['admin', 'superadmin']);

        try {
          await supabase.from('audit_log').insert({
            admin_id: ctx.userId,
            action: 'TOTP_HARD_RESET',
            resource_type: 'users',
            resource_id: targetUserId,
            ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
          });
        } catch {
          /* non-blocking */
        }

        return json({ success: true, message: '2FA hard reset complete' }, 200, {}, req);
      }

      if (action === 'list-admins') {
        const { data: actor } = await supabase.from('users').select('role').eq('id', ctx.userId).maybeSingle();
        if (actor?.role !== 'superadmin' && actor?.role !== 'admin') {
          return json({ error: 'Forbidden' }, 403, {}, req);
        }

        const { data: admins, error } = await supabase
          .from('users')
          .select('id, username, display_name, role, totp_enabled, totp_skipped_at')
          .in('role', ['admin', 'superadmin'])
          .order('username');

        if (error) return json({ error: error.message }, 500, {}, req);
        return json({ success: true, admins: admins || [] }, 200, {}, req);
      }

      return json({ error: 'Unknown action' }, 400, {}, req);
    } catch (err) {
      console.error('[AUTH-2FA]', err);
      return json({ error: 'Internal server error' }, 500, {}, req);
    }
  },
};
