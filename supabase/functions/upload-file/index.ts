import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { randomUUID } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://app.mynumber9.uk",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-token",
};

const ALLOWED_TYPES = {
  "proof-of-payment": ["image/jpeg", "image/png", "application/pdf"],
  "kyc-document": ["image/jpeg", "image/png", "application/pdf"],
  "avatar": ["image/jpeg", "image/png", "image/webp"],
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;

console.info("NUMBER9 File Upload Function Started");

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
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const uploadType = formData.get("type") as string;
    if (!file) return Response.json({ error: "No file provided" }, { status: 400, headers: corsHeaders });
    if (!uploadType) return Response.json({ error: "Upload type required" }, { status: 400, headers: corsHeaders });
    if (!Object.keys(ALLOWED_TYPES).includes(uploadType)) return Response.json({ error: "Invalid upload type" }, { status: 400, headers: corsHeaders });
    const allowedMimes = ALLOWED_TYPES[uploadType as keyof typeof ALLOWED_TYPES];
    if (!allowedMimes.includes(file.type)) return Response.json({ error: `Invalid file type. Allowed: ${allowedMimes.join(", ")}` }, { status: 400, headers: corsHeaders });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }, { status: 400, headers: corsHeaders });

    const fileExtension = file.name.split(".").pop();
    const uniqueFilename = `${uploadType}/${user.id}/${randomUUID()}.${fileExtension}`;
    const buffer = await file.arrayBuffer();
    const { data, error } = await supabase.storage.from("n9-uploads").upload(uniqueFilename, buffer, { contentType: file.type, cacheControl: "3600", upsert: false });
    if (error) return Response.json({ error: "Upload failed: " + error.message }, { status: 500, headers: corsHeaders });

    const { data: { publicUrl } } = supabase.storage.from("n9-uploads").getPublicUrl(uniqueFilename);
    await supabase.from("n9_audit_logs").insert({ user_id: user.id, action: "FILE_UPLOADED", status: "SUCCESS", details: { uploadType, filename: file.name, size: file.size, type: file.type, storagePath: data.path } });

    return Response.json({
      success: true, data: { id: randomUUID(), filename: file.name, path: data.path, url: publicUrl, type: uploadType, size: file.size, uploadedAt: new Date().toISOString() },
      message: "File uploaded successfully",
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Upload exception:", error);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: corsHeaders });
  }
});

export default { fetch: (req) => handler(req) };
