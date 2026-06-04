import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { randomBytes } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const generateRandomString = (length: number) => randomBytes(length).toString("hex");

console.info("NUMBER9 Custom API Function Started");

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
    }
    try {
      const body = await req.json();
      const randomString = generateRandomString(10);
      return Response.json({ success: true, message: `Hello ${body.name || "Functions"}`, randomId: randomString, timestamp: new Date().toISOString() }, { headers: corsHeaders });
    } catch {
      return Response.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
    }
  },
};
