// Direct Supabase REST API calls with x-user-token header.
// Bypasses supabase-js client which may not pass custom headers properly in v2.107+.

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

function getHeaders() {
  let token = null;
  try {
    const raw = localStorage.getItem('n9_auth');
    if (raw) token = JSON.parse(raw)?.token || null;
  } catch { /* ignore */ }
  return {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(token ? { 'x-user-token': token } : {}),
  };
}

export async function apiSelect(table, columns, eqField, eqValue) {
  const h = getHeaders();
  const res = await fetch(`${url}/rest/v1/${table}?${eqField}=eq.${eqValue}&select=${columns}&limit=1`, { headers: h });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.[0] || null;
}

export async function apiSelectAll(table, query = '') {
  const h = getHeaders();
  const sep = query ? '&' : '';
  const res = await fetch(`${url}/rest/v1/${table}${sep}${query}`, { headers: h });
  if (!res.ok) return null;
  return res.json();
}

export async function apiRpc(name, params = {}) {
  const h = getHeaders();
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || body?.message || `RPC ${name} failed`);
  }
  return res.json();
}

export async function apiInvoke(functionName, body = {}) {
  const h = getHeaders();
  const res = await fetch(`${url}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Function ${functionName} failed`);
  }
  return res.json();
}
