Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const svc = Deno.env.get('N9_SERVICE_ROLE_KEY') || 'not-set';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    return new Response(JSON.stringify({
      svc_prefix: svc.substring(0, 10),
      svc_len: svc.length,
      supabaseUrl: supabaseUrl,
      body: body,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
