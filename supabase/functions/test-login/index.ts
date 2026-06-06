Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const allowed = origin === 'https://admin.mynumber9.uk' ? origin : 'https://admin.mynumber9.uk';
  try {
    const body = await req.json().catch(() => ({}));
    return new Response(JSON.stringify({
      status: 'ok',
      body: body,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowed },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowed },
    });
  }
});
