/**
 * Cloudflare Worker — EC2 Server Monitor Proxy
 *
 * Deploy steps:
 * 1. Buka https://dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. Paste kode ini, klik Deploy
 * 3. Tambah Custom Domain/Route: admin.mynumber9.uk/api/server-status → worker ini
 *    ATAU pakai subdomain worker default (xxx.workers.dev)
 */

const EC2_URL = 'http://ec2-107-22-51-206.compute-1.amazonaws.com:5000/status';
// API key is provided via a Wrangler secret (MONITOR_API_KEY) — never hardcoded.
// Set it with: echo "<key>" | npx wrangler secret put MONITOR_API_KEY

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': 'https://admin.mynumber9.uk',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const upstream = await fetch(EC2_URL, {
        headers: { 'X-API-KEY': env.MONITOR_API_KEY },
        signal: AbortSignal.timeout(5000),
      });

      if (!upstream.ok) {
        const body = await upstream.text();
        return Response.json({ error: 'upstream error', status: upstream.status, body }, { status: 502 });
      }

      const data = await upstream.json();

      return Response.json(data, {
        headers: {
          'Access-Control-Allow-Origin': 'https://admin.mynumber9.uk',
          'Cache-Control': 'no-store',
        },
      });
    } catch (err) {
      return Response.json({ error: 'unreachable', detail: err.message }, {
        status: 503,
        headers: { 'Access-Control-Allow-Origin': 'https://admin.mynumber9.uk' },
      });
    }
  },
};
