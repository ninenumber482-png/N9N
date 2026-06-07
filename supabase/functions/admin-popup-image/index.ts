import { createClient } from 'jsr:@supabase/supabase-js@2'

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ALLOWED_ORIGINS = ["https://admin.mynumber9.uk", "https://mynumber9.uk"];

function corsOrigin(req: Request): string {
  const o = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0];
}

const corsHeaders = (req: Request) => ({
  "Access-Control-Allow-Origin": corsOrigin(req),
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Credentials": "true",
});

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

Deno.serve(async (req) => {
  const ch = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ch });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: ch });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("N9_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), { status: 500, headers: ch });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const token = (() => {
    const headerToken = req.headers.get('x-session-token') || '';
    if (headerToken) return headerToken;
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/n9_session=([^;]+)/);
    if (match) return match[1];
    return '';
  })();
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: ch });
  }

  // Validate session token
  const tokenHash = await sha256(token);
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, user_id")
    .eq("token_hash", tokenHash)
    .is("logged_out_at", null)
    .single();

  if (sessionErr || !session) {
    return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: ch });
  }

  // Check admin role
  const { data: user } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", session.user_id)
    .single();

  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: ch });
  }

  try {
    const { dataUrl, title, linkUrl, bannerId } = await req.json();

    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return new Response(JSON.stringify({ error: "Invalid file payload" }), { status: 400, headers: ch });
    }

    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Only base64 data URLs are supported" }), { status: 400, headers: ch });
    }

    const mime = match[1];
    const ext = ALLOWED_MIME[mime];
    if (!ext) {
      return new Response(JSON.stringify({ error: `Unsupported file type: ${mime}` }), { status: 400, headers: ch });
    }

    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    if (bytes.byteLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: `File exceeds 5MB limit` }), { status: 400, headers: ch });
    }

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.id === "popups")) {
      await supabase.storage.createBucket("popups", { public: true, fileSizeLimit: MAX_BYTES });
    }

    // If bannerId provided, delete old file first
    if (bannerId) {
      const { data: old } = await supabase.from("popup_banners").select("image_path").eq("id", bannerId).single();
      if (old?.image_path) {
        await supabase.storage.from("popups").remove([old.image_path]);
      }
    }

    const filePath = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("popups")
      .upload(filePath, bytes, { contentType: mime, upsert: false });

    if (upErr) {
      return new Response(JSON.stringify({ error: "Upload failed: " + upErr.message }), { status: 500, headers: ch });
    }

    const { data: publicUrlData } = supabase.storage.from("popups").getPublicUrl(filePath);
    const imageUrl = publicUrlData?.publicUrl ?? `${supabaseUrl}/storage/v1/object/public/popups/${filePath}`;

    // Upsert banner record
    const bannerData: Record<string, unknown> = {
      image_url: imageUrl,
      image_path: filePath,
      title: title || "",
      link_url: linkUrl || "",
      created_by: user.id,
    };

    let result;
    if (bannerId) {
      const { data: updated } = await supabase
        .from("popup_banners")
        .update({ ...bannerData, updated_at: new Date().toISOString() })
        .eq("id", bannerId)
        .select()
        .single();
      result = updated;
    } else {
      const { data: inserted } = await supabase
        .from("popup_banners")
        .insert({ ...bannerData, active: false })
        .select()
        .single();
      result = inserted;
    }

    return new Response(JSON.stringify({ success: true, banner: result }), {
      status: 200, headers: { "Content-Type": "application/json", ...ch },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error)?.message || "Internal error" }), {
      status: 500, headers: ch,
    });
  }
});
