const GATEWAY_KEY = '211099yy362745';
const COOKIE_NAME = 'n9_gateway';
const COOKIE_MAX_AGE = 28800; // 8 jam
const RATE_LIMIT_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_MS = 900_000; // 15 menit

const rateStore = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateStore.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateStore.set(ip, { attempts: 1, windowStart: now });
    return true;
  }
  if (entry.attempts >= RATE_LIMIT_ATTEMPTS) return false;
  entry.attempts++;
  return true;
}

function logAccess(ip, path, status) {
  try {
    console.log(`[GATEWAY] ${new Date().toISOString()} ${ip} ${status} ${path}`);
  } catch {}
}

const HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NUMBER9 Admin — Gateway</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0f;font-family:system-ui,-apple-system,sans-serif;color:#e4e4e7}
.card{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:40px;width:360px;text-align:center}
.logo{font-size:24px;font-weight:700;letter-spacing:-.5px;background:linear-gradient(135deg,#f59e0b,#d97706);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px}
.sub{color:#71717a;font-size:13px;margin-bottom:24px}
input{width:100%;padding:10px 14px;background:#09090b;border:1px solid #27272a;border-radius:8px;color:#e4e4e7;font-size:14px;outline:none;transition:border-color .2s}
input:focus{border-color:#f59e0b}
button{width:100%;margin-top:16px;padding:10px;padding:10px;background:linear-gradient(135deg,#f59e0b,#d97706);border:none;border-radius:8px;color:#18181b;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .2s}
button:hover{opacity:.9}
.error{color:#ef4444;font-size:12px;margin-top:12px;display:none}
.locked{color:#ef4444;font-size:12px;margin-top:12px;display:none}
</style>
</head>
<body>
<div class="card">
<div class="logo">NUMBER9</div>
<div class="sub">Admin Access Gateway</div>
<form method="POST" action="/__gateway">
<input type="password" name="key" placeholder="Masukkan kode akses" autofocus>
<button type="submit">MASUK</button>
</form>
<div class="error" id="error">Kode akses salah</div>
<div class="locked" id="locked">Terlalu banyak percobaan. Coba lagi 15 menit lagi.</div>
</div>
<script>
const p=new URLSearchParams(location.search);
if(p.get('e')==='1') document.getElementById('error').style.display='block';
if(p.get('l')==='1') document.getElementById('locked').style.display='block';
</script>
</body>
</html>`;

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown';
  const cookie = request.headers.get('Cookie') || '';

  if (cookie.includes(`${COOKIE_NAME}=1`)) {
    logAccess(ip, url.pathname, 'PASS');
    return env.ASSETS.fetch(request);
  }

  if (!checkRateLimit(ip)) {
    logAccess(ip, url.pathname, 'RATE_LIMITED');
    return new Response(HTML.replace('id="locked">', 'id="locked" style="display:block">'), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  if (url.pathname === '/__gateway' && request.method === 'POST') {
    const formData = await request.formData();
    const key = formData.get('key') || '';
    if (key === GATEWAY_KEY) {
      rateStore.delete(ip);
      logAccess(ip, url.pathname, 'AUTH_OK');
      const dest = url.searchParams.get('r') || '/';
      const response = new Response(null, { status: 302, headers: { Location: dest } });
      response.headers.set('Set-Cookie', `${COOKIE_NAME}=1; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}`);
      return response;
    }
    logAccess(ip, url.pathname, 'AUTH_FAIL');
    return new Response(null, { status: 302, headers: { Location: '/?e=1' } });
  }

  logAccess(ip, url.pathname, 'BLOCKED');
  return new Response(HTML, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}

export default { fetch: handleRequest };
