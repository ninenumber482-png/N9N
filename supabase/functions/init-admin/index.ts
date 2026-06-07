import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data, error } = await supabase
    .from('users')
    .upsert({
      id: '11111111-1111-1111-1111-111111111111',
      username: 'admin',
      email: 'admin@mynumber9.uk',
      display_name: 'Admin',
      password_hash: '$2a$10$VxZMXlR.vJVSZHCWF/8/Fe8Q3.HuH4kBf4qKzZPakCPKJqnMjK7oK',
      kyc_status: 'VERIFIED',
      account_status: 'ACTIVE',
      login_status: 'ACTIVE',
      registration_status: 'APPROVED',
      role: 'admin',
      country: 'ID',
    }, { onConflict: 'username' })

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, message: 'Admin user created/updated' }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
  )
})
