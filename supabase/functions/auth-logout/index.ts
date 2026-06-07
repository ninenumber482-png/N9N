import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://admin.mynumber9.uk",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Credentials": "true",
};

console.info("NUMBER9 Auth Logout Function Started");

const handler = withSupabase({ auth: "user" }, async (req, { supabase, user }) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401, headers: corsHeaders });
  }
  try {
    await supabase.from("sessions").delete().eq("user_id", user.id);
    await supabase.from("users").update({ session_token: null, session_expires_at: null }).eq("id", user.id);
    await supabase.from("n9_audit_logs").insert({ user_id: user.id, action: "LOGOUT", status: "SUCCESS", details: { email: user.email } });
    return Response.json({ success: true, message: "Logged out successfully" }, {
      headers: {
        ...corsHeaders,
        "Set-Cookie": "n9_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0",
      },
    });
  } catch (error) {
    console.error("Logout error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
  }
});

export default { fetch: (req) => handler(req) };
