import { createClient } from 'jsr:@supabase/supabase-js@2'

// ONE-TIME USE: delete this function after password is reset
const SECRET = 'n9-reset-2026'
const NEW_HASH = '$2b$12$Ei3rdTAxH7yNdF9G68dGi.OJE2pP8WLiHYzkQA8oBE/aI.2hAAOlC' // Admin@9999

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const body = await req.json().catch(() => ({}))
  if (body.secret !== SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('N9_SERVICE_ROLE_KEY')!)

  const { error: e1 } = await supabase
    .from('n9_users')
    .update({ password_hash: NEW_HASH })
    .eq('username', 'number9')

  const { error: e2 } = await supabase
    .from('users')
    .update({ password_hash: NEW_HASH })
    .eq('username', 'number9')

  return new Response(JSON.stringify({
    n9_users: e1 ? e1.message : 'updated',
    users: e2 ? e2.message : 'updated (or no row)',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
