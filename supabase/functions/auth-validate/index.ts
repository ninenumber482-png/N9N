// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

console.info("NUMBER9 Auth Validate Function Started");

export default {
  fetch: withSupabase({ auth: "user" }, async (req, { supabase, user }) => {
    // Only allow GET
    if (req.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Check if user is authenticated
    if (!user) {
      return Response.json(
        { valid: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    try {
      // Get user profile from n9_users table
      const { data: userProfile, error: profileError } = await supabase
        .from("n9_users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError || !userProfile) {
        return Response.json(
          { valid: false, error: "User profile not found" },
          { status: 404 }
        );
      }

      // Check if user is active
      if (!userProfile.is_active) {
        return Response.json(
          { valid: false, error: "User account is inactive" },
          { status: 403 }
        );
      }

      return Response.json({
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          username: userProfile.username,
          role: userProfile.role,
          name: userProfile.full_name,
          lastLogin: userProfile.last_login,
        },
        message: "Session is valid",
      });
    } catch (error) {
      console.error("Validate error:", error);
      return Response.json(
        { valid: false, error: "Internal server error" },
        { status: 500 }
      );
    }
  }),
};
