// DISABLED — was an unauthenticated echo endpoint (security risk)
Deno.serve(async () => {
  return new Response(JSON.stringify({ error: 'This endpoint has been disabled' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json' },
  });
});
