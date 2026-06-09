// Direct Supabase REST API calls.
// Uses httpOnly cookies for authentication (credentials: 'include').

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;
const TIMEOUT_MS = 15000;

function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  try {
    const authRaw = localStorage.getItem('n9_auth');
    if (authRaw) {
      const auth = JSON.parse(authRaw);
      if (auth.token) headers['x-user-token'] = auth.token;
    }
  } catch {}
  return headers;
}

async function apiFetch(fetchUrl, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(fetchUrl, { ...options, credentials: 'include', signal: controller.signal });
    return res;
  } catch (err) {
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiSelect(table, columns, eqField, eqValue) {
  const h = getHeaders();
  const res = await apiFetch(`${url}/rest/v1/${table}?${eqField}=eq.${eqValue}&select=${columns}&limit=1`, { headers: h });
  if (!res || !res.ok) return null;
  const data = await res.json();
  return data?.[0] || null;
}

export async function apiSelectAll(table, query = '') {
  const h = getHeaders();
  const sep = query ? '?' : '';
  const res = await apiFetch(`${url}/rest/v1/${table}${sep}${query}`, { headers: h });
  if (!res || !res.ok) return null;
  return res.json();
}

export async function apiRpc(name, params = {}) {
  const h = getHeaders();
  const res = await apiFetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(params),
  });
  if (!res) throw new Error('Network error: request timed out or failed');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error || body?.message || `RPC ${name} failed`;
    if (res.status === 401 || res.status === 403) throw new Error('Sesi habis, silakan login ulang.');
    throw new Error(msg);
  }
  return res.json();
}

export async function apiInvoke(functionName, body = {}) {
  const h = getHeaders();
  const res = await apiFetch(`${url}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(body),
  });
  if (!res) throw new Error('Network error: request timed out or failed');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) throw new Error('Sesi habis, silakan login ulang.');
    throw new Error(text || `Function ${functionName} failed`);
  }
  return res.json();
}
