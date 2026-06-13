import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const ALLOWED_ORIGINS = [
  "https://admin.mynumber9.uk",
  "https://number9sistemd.observer",
  "https://number9-admin.pages.dev",
  "https://master.number9-admin.pages.dev",
  "http://localhost:4200",
  "http://localhost:4201",
];
function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  };
}

console.info("NUMBER9 Auth Validate Function Started");

const handler = withSupabase({ auth: "user" }, async (req, { supabase, user }) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors(req) });
  }
  if (!user) {
    return Response.json({ valid: false, error: "Not authenticated" }, { status: 401, headers: cors(req) });
  }
  try {
    const { data: userProfile, error: profileError } = await supabase
      .from("n9_users").select("*").eq("id", user.id).single();
    if (profileError || !userProfile) {
      return Response.json({ valid: false, error: "User profile not found" }, { status: 404, headers: cors(req) });
    }
    if (!userProfile.is_active) {
      return Response.json({ valid: false, error: "User account is inactive" }, { status: 403, headers: cors(req) });
    }
    return Response.json({
      valid: true,
      user: { id: user.id, email: user.email, username: userProfile.username, role: userProfile.role, name: userProfile.full_name, lastLogin: userProfile.last_login },
      message: "Session is valid",
    }, { headers: cors(req) });
  } catch (error) {
    console.error("Validate error:", error);
    return Response.json({ valid: false, error: "Internal server error" }, { status: 500, headers: cors(req) });
  }
});

export default { fetch: (req) => handler(req) };
