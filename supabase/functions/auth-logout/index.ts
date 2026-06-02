// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

console.info("NUMBER9 Auth Logout Function Started");

export default {
  fetch: withSupabase({ auth: "user" }, async (req, { supabase, user }) => {
    // Only allow POST
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Check authentication
    if (!user) {
      return Response.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    try {
      // Log logout event
      await supabase.from("n9_audit_logs").insert({
        user_id: user.id,
        action: "LOGOUT",
        status: "SUCCESS",
        details: {
          email: user.email,
        },
      });

      return Response.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      console.error("Logout error:", error);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }),
};
