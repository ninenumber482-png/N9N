const ALLOWED_IPS_DEFAULT = '203.144.92.42,203.144.92.170';

const whitelistCache = new Map();
const CACHE_TTL = 30_000;

function getSupabaseEnv(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env binding');
  return { url, key };
}

async function isIpWhitelisted(ip, allowedIps, env) {
  if (allowedIps.split(',').map(s => s.trim()).includes(ip)) return true;

  const cached = whitelistCache.get(ip);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.allowed;

  try {
    const { url, key } = getSupabaseEnv(env);
    const res = await fetch(`${url}/rest/v1/rpc/is_ip_allowed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_ip: ip }),
    });
    const allowed = res.ok && await res.json() === true;
    whitelistCache.set(ip, { allowed, ts: Date.now() });
    if (whitelistCache.size > 100) whitelistCache.clear();
    return allowed;
  } catch {
    return false;
  }
}

async function addIpToWhitelist(ip, env) {
  try {
    const { url, key } = getSupabaseEnv(env);
    const res = await fetch(`${url}/rest/v1/rpc/add_allowed_ip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_ip: ip, p_label: 'emergency-self-whitelist' }),
    });
    whitelistCache.delete(ip);
    return res.ok;
  } catch {
    return false;
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timingSafeEqual(a, b) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

function blockedHtml(ip, error) {
  const safeIp = escapeHtml(ip);
  const errorHtml = error ? `<div class="error-msg">${escapeHtml(error)}</div>` : '';
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Akses Diblokir — NUMBER9</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0f;font-family:system-ui,-apple-system,sans-serif;color:#e4e4e7;padding:20px}
.card{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:40px;width:420px;text-align:center}
.lock{font-size:48px;margin-bottom:8px;color:#ef4444}
.logo{font-size:24px;font-weight:700;letter-spacing:-.5px;background:linear-gradient(135deg,#f59e0b,#d97706);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px}
.sub{color:#71717a;font-size:13px;margin-bottom:16px;line-height:1.5}
.ip{background:#0a0a0f;border:1px solid #27272a;border-radius:8px;padding:10px;font-family:monospace;font-size:13px;color:#f59e0b;margin-bottom:16px}
.footer{color:#52525b;font-size:11px;margin-top:20px}
.divider{border:none;border-top:1px solid #27272a;margin:20px 0}
.unlock-title{color:#a1a1aa;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
input{width:100%;padding:10px 14px;background:#09090b;border:1px solid #27272a;border-radius:8px;color:#e4e4e7;font-size:14px;outline:none;transition:border-color .2s;margin-bottom:10px;text-align:center}
input:focus{border-color:#f59e0b}
input::placeholder{color:#52525b}
button{width:100%;padding:10px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;border-radius:8px;color:#18181b;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s}
button:hover{opacity:.9}
.error-msg{color:#ef4444;font-size:12px;margin-bottom:12px}
.success-msg{color:#22c55e;font-size:12px;margin-bottom:12px}
.note{color:#52525b;font-size:11px;margin-top:10px}
</style>
</head>
<body>
<div class="card">
<div class="lock">⛔</div>
<div class="logo">NUMBER9</div>
<div class="sub">Akses ditolak. IP Anda tidak terdaftar dalam whitelist.</div>
<div class="ip">${safeIp}</div>
${errorHtml}
<hr class="divider">
<div class="unlock-title">Emergency Whitelist</div>
<form method="POST" action="/">
<input type="password" name="gateway_key" placeholder="Masukkan Gateway Key" autofocus>
<button type="submit">BUKA WHITELIST</button>
</form>
<div class="note">Masukkan gateway key untuk mendaftarkan IP Anda secara otomatis</div>
<div class="footer">NUMBER9 Security Gateway — System D</div>
</div>
</body>
</html>`;
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const allowedIps = env.ALLOWED_IPS || ALLOWED_IPS_DEFAULT;
  const gatewayKey = env.GATEWAY_KEY;

  // Handle POST — emergency whitelist unlock
  if (request.method === 'POST' && url.pathname === '/') {
    if (!gatewayKey) {
      return new Response(blockedHtml(ip, 'Gateway key not configured.'), {
        status: 500,
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }
    try {
      const formData = await request.formData();
      const key = formData.get('gateway_key') || '';

      let valid = false;
      if (key.length === gatewayKey.length) {
        valid = timingSafeEqual(key, gatewayKey);
      }
      if (!valid) {
        return new Response(blockedHtml(ip, 'Gateway key salah!'), {
          status: 403,
          headers: { 'Content-Type': 'text/html;charset=utf-8' },
        });
      }

      const added = await addIpToWhitelist(ip, env);
      if (!added) {
        return new Response(blockedHtml(ip, 'Gagal mendaftarkan IP. Coba lagi.'), {
          status: 500,
          headers: { 'Content-Type': 'text/html;charset=utf-8' },
        });
      }

      // Success → redirect to login page
      return new Response(null, {
        status: 302,
        headers: { Location: '/' },
      });
    } catch {
      return new Response(blockedHtml(ip, 'Terjadi kesalahan server.'), {
        status: 500,
        headers: { 'Content-Type': 'text/html;charset=utf-8' },
      });
    }
  }

  const whitelisted = await isIpWhitelisted(ip, allowedIps, env);
  if (!whitelisted) {
    return new Response(blockedHtml(ip, ''), {
      status: 403,
      headers: { 'Content-Type': 'text/html;charset=utf-8' },
    });
  }

  return env.ASSETS.fetch(request);
}

export default { fetch: handleRequest };
