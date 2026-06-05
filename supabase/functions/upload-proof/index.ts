// upload-proof — authenticated proof-image upload for the NUMBER9 user app.
//
// The user app authenticates via a custom `x-user-token` header (users.session_token),
// NOT Supabase Auth, so a Storage RLS policy cannot see the user identity and cannot
// enforce per-user folders. This function verifies the token server-side and uploads
// with the service role (bypassing RLS) into the caller's own folder: proofs/<userId>/...
//
// Called from the client via supabase.functions.invoke('upload-proof', { body: { ... } }).
// The client's custom fetch injects x-user-token automatically.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ALLOWED_ORIGINS = ["https://app.mynumber9.uk", "https://mynumber9.uk", "http://localhost:5175"];

const corsHeaders = (origin = "") => {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-token",
  };
};

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_KINDS = new Set(["deposit", "kyc"]);

export default {
  fetch: async (req: Request) => {
    const o = req.headers.get("origin") || "";
    const ch = () => corsHeaders(o);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...ch() } });

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: ch() });
    }
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const token = req.headers.get("x-user-token");
    if (!token) {
      return json({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("N9_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Server misconfiguration" }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify the session token → resolve the calling user's id.
    const tokenHash = await sha256(token);
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("session_token", tokenHash)
      .gt("session_expires_at", new Date().toISOString())
      .single();

    if (userErr || !user) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    try {
      const { dataUrl, kind = "deposit" } = await req.json();

      if (!ALLOWED_KINDS.has(kind)) {
        return json({ error: "Invalid kind" }, 400);
      }
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
        return json({ error: "Invalid file payload" }, 400);
      }

      // Parse "data:<mime>;base64,<payload>"
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return json({ error: "Only base64 data URLs are supported" }, 400);
      }
      const mime = match[1];
      const ext = ALLOWED_MIME[mime];
      if (!ext) {
        return json({ error: `Unsupported file type: ${mime}` }, 400);
      }

      const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
      if (bytes.byteLength > MAX_BYTES) {
        return json({ error: `File exceeds ${MAX_BYTES / 1024 / 1024}MB limit` }, 400);
      }

      const path = `${user.id}/${kind}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("proofs")
        .upload(path, bytes, { contentType: mime, upsert: false });

      if (upErr) {
        console.error("[UPLOAD-PROOF] Upload failed:", upErr.message);
        return json({ error: "Upload failed" }, 500);
      }

      const { data } = supabase.storage.from("proofs").getPublicUrl(path);
      return json({ success: true, url: data?.publicUrl ?? null, path });
    } catch (e) {
      console.error("[UPLOAD-PROOF] Exception:", (e as Error)?.message);
      return json({ error: "Internal server error" }, 500);
    }
  },
};
