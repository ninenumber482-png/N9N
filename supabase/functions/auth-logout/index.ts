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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Credentials": "true",
  };
}

console.info("NUMBER9 Auth Logout Function Started");

const handler = withSupabase({ auth: "user" }, async (req, { supabase, user }) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors(req) });
  }
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401, headers: cors(req) });
  }
  try {
    await supabase.from("sessions").delete().eq("user_id", user.id);
    await supabase.from("users").update({ session_token: null, session_expires_at: null }).eq("id", user.id);
    await supabase.from("n9_audit_logs").insert({ user_id: user.id, action: "LOGOUT", status: "SUCCESS", details: { email: user.email } });
    return Response.json({ success: true, message: "Logged out successfully" }, {
      headers: {
        ...cors(req),
        "Set-Cookie": "n9_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0",
      },
    });
  } catch (error) {
    console.error("Logout error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: cors(req) });
  }
});

export default { fetch: (req) => handler(req) };
