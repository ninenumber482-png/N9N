// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { randomBytes } from "node:crypto";

const generateRandomString = (length: number) => {
  const buffer = randomBytes(length);
  return buffer.toString("hex");
};

console.info("NUMBER9 Custom API Function Started");

export default {
  fetch: async (req: Request) => {
    // Only allow POST
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const body = await req.json();
      const randomString = generateRandomString(10);

      return Response.json({
        success: true,
        message: `Hello ${body.name || "Functions"}`,
        randomId: randomString,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("API error:", error);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  },
};
