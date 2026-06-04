import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://admin.mynumber9.uk",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
};

console.info("NUMBER9 Auth Validate Function Started");

const handler = withSupabase({ auth: "user" }, async (req, { supabase, user }) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }
  if (!user) {
    return Response.json({ valid: false, error: "Not authenticated" }, { status: 401, headers: corsHeaders });
  }
  try {
    const { data: userProfile, error: profileError } = await supabase
      .from("n9_users").select("*").eq("id", user.id).single();
    if (profileError || !userProfile) {
      return Response.json({ valid: false, error: "User profile not found" }, { status: 404, headers: corsHeaders });
    }
    if (!userProfile.is_active) {
      return Response.json({ valid: false, error: "User account is inactive" }, { status: 403, headers: corsHeaders });
    }
    return Response.json({
      valid: true,
      user: { id: user.id, email: user.email, username: userProfile.username, role: userProfile.role, name: userProfile.full_name, lastLogin: userProfile.last_login },
      message: "Session is valid",
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Validate error:", error);
    return Response.json({ valid: false, error: "Internal server error" }, { status: 500, headers: corsHeaders });
  }
});

export default { fetch: (req) => handler(req) };
