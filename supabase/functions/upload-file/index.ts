// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { randomUUID } from "node:crypto";

// Allowed file types for NUMBER9
const ALLOWED_TYPES = {
  "proof-of-payment": ["image/jpeg", "image/png", "application/pdf"],
  "kyc-document": ["image/jpeg", "image/png", "application/pdf"],
  "avatar": ["image/jpeg", "image/png", "image/webp"],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

console.info("NUMBER9 File Upload Function Started");

export default {
  fetch: withSupabase({ auth: "user" }, async (req, { supabase, user }) => {
    // Only allow POST
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    // Check authentication
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const uploadType = formData.get("type") as string;

      // Validate input
      if (!file) {
        return Response.json({ error: "No file provided" }, { status: 400 });
      }

      if (!uploadType) {
        return Response.json(
          { error: "Upload type required" },
          { status: 400 }
        );
      }

      // Validate upload type
      if (!Object.keys(ALLOWED_TYPES).includes(uploadType)) {
        return Response.json(
          { error: "Invalid upload type" },
          { status: 400 }
        );
      }

      // Validate file type
      const allowedMimes = ALLOWED_TYPES[uploadType as keyof typeof ALLOWED_TYPES];
      if (!allowedMimes.includes(file.type)) {
        return Response.json(
          { error: `Invalid file type. Allowed: ${allowedMimes.join(", ")}` },
          { status: 400 }
        );
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return Response.json(
          { error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
          { status: 400 }
        );
      }

      // Generate unique filename
      const fileExtension = file.name.split(".").pop();
      const uniqueFilename = `${uploadType}/${user.id}/${randomUUID()}.${fileExtension}`;

      // Convert file to buffer
      const buffer = await file.arrayBuffer();

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from("n9-uploads")
        .upload(uniqueFilename, buffer, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error("Upload error:", error);
        return Response.json(
          { error: "Upload failed: " + error.message },
          { status: 500 }
        );
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage
        .from("n9-uploads")
        .getPublicUrl(uniqueFilename);

      // Log upload event
      await supabase.from("n9_audit_logs").insert({
        user_id: user.id,
        action: "FILE_UPLOADED",
        status: "SUCCESS",
        details: {
          uploadType,
          filename: file.name,
          size: file.size,
          type: file.type,
          storagePath: data.path,
        },
      });

      return Response.json({
        success: true,
        data: {
          id: randomUUID(),
          filename: file.name,
          path: data.path,
          url: publicUrl,
          type: uploadType,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        },
        message: "File uploaded successfully",
      });
    } catch (error) {
      console.error("Upload exception:", error);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }),
};
