import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { randomUUID } from "node:crypto";

const ALLOWED_ORIGINS = [
  "https://app.mynumber9.uk",
  "https://mynumber9.uk",
  "https://admin.mynumber9.uk",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:4200",
  "http://localhost:4201"
];

function corsOrigin(req: Request): string {
  const o = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0];
}

const corsHeaders = (req?: Request) => {
  const origin = req ? corsOrigin(req) : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-token",
  };
};

const ALLOWED_TYPES = {
  "proof-of-payment": ["image/jpeg", "image/png", "application/pdf"],
  "kyc-document": ["image/jpeg", "image/png", "application/pdf"],
  "avatar": ["image/jpeg", "image/png", "image/webp"],
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;

console.info("NUMBER9 File Upload Function Started");

const handler = withSupabase({ auth: "user" }, async (req, { supabase, user }) => {
  const ch = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: ch });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: ch });
  }
  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401, headers: ch });
  }
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const uploadType = formData.get("type") as string;
    if (!file) return Response.json({ error: "No file provided" }, { status: 400, headers: ch });
    if (!uploadType) return Response.json({ error: "Upload type required" }, { status: 400, headers: ch });
    if (!Object.keys(ALLOWED_TYPES).includes(uploadType)) return Response.json({ error: "Invalid upload type" }, { status: 400, headers: ch });
    const allowedMimes = ALLOWED_TYPES[uploadType as keyof typeof ALLOWED_TYPES];
    if (!allowedMimes.includes(file.type)) return Response.json({ error: `Invalid file type. Allowed: ${allowedMimes.join(", ")}` }, { status: 400, headers: ch });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }, { status: 400, headers: ch });

    const fileExtension = file.name.split(".").pop();
    const uniqueFilename = `${uploadType}/${user.id}/${randomUUID()}.${fileExtension}`;
    const buffer = await file.arrayBuffer();
    const { data, error } = await supabase.storage.from("n9-uploads").upload(uniqueFilename, buffer, { contentType: file.type, cacheControl: "3600", upsert: false });
    if (error) return Response.json({ error: "Upload failed: " + error.message }, { status: 500, headers: ch });

    const { data: { publicUrl } } = supabase.storage.from("n9-uploads").getPublicUrl(uniqueFilename);
    await supabase.from("n9_audit_logs").insert({ user_id: user.id, action: "FILE_UPLOADED", status: "SUCCESS", details: { uploadType, filename: file.name, size: file.size, type: file.type, storagePath: data.path } });

    return Response.json({
      success: true, data: { id: randomUUID(), filename: file.name, path: data.path, url: publicUrl, type: uploadType, size: file.size, uploadedAt: new Date().toISOString() },
      message: "File uploaded successfully",
    }, { headers: ch });
  } catch (error) {
    console.error("Upload exception:", error);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: ch });
  }
});

export default { fetch: (req) => handler(req) };
