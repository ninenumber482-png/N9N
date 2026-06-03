import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'
import bcrypt from 'npm:bcryptjs@2.4.3'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const generateRefCode = () => {
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `N9-USER-${rand}`;
};

type SupaClient = ReturnType<typeof createClient>;

// Resolves a referral code (personal user code OR system referrals code).
// Returns { ok, referralId, referredByUser, upline } or an error string.
async function resolveReferral(supabase: SupaClient, rawCode: string) {
  const normCode = String(rawCode).trim().toUpperCase();

  // 1. Personal user code
  const { data: refOwner } = await supabase
    .from("users")
    .select("id,username,display_name,account_status,referral_code")
    .eq("referral_code", normCode)
    .maybeSingle();

  if (refOwner) {
    if (refOwner.account_status !== "ACTIVE") {
      return { error: "Referral code belongs to an inactive account." };
    }
    return {
      referralId: null as string | null,
      referredByUser: refOwner.id as string | null,
      upline: { uuid: refOwner.id, username: refOwner.username, displayName: refOwner.display_name, referralCode: refOwner.referral_code },
    };
  }

  // 2. System referrals table (admin-generated)
  const { data: refData } = await supabase
    .from("referrals")
    .select("id,code,status,expires_at,max_uses,used_count,created_by")
    .eq("code", normCode)
    .maybeSingle();
  if (!refData) return { error: "Referral code is invalid." };
  if (refData.status !== "ACTIVE") return { error: "Referral code is inactive." };
  if (refData.expires_at && new Date(refData.expires_at) < new Date()) {
    return { error: "Referral code has expired." };
  }
  if (refData.max_uses != null && refData.used_count >= refData.max_uses) {
    return { error: "Referral code usage limit reached." };
  }

  let creator: { id: string; username: string; display_name: string } | null = null;
  if (refData.created_by) {
    const { data } = await supabase
      .from("users").select("id,username,display_name").eq("id", refData.created_by).maybeSingle();
    creator = data;
  }
  return {
    referralId: refData.id as string,
    referredByUser: (refData.created_by || null) as string | null,
    upline: {
      uuid: creator?.id || refData.created_by,
      username: creator?.username || "NUMBER9",
      displayName: creator?.display_name || "NUMBER9 Platform",
      referralCode: refData.code,
    },
  };
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      const data = await req.json();

      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY')
      if (!supabaseUrl || !serviceRoleKey) {
        return json({ error: 'Server misconfiguration' }, 500)
      }
      const supabase = createClient(supabaseUrl, serviceRoleKey)

      // ---- validateOnly: referral preview during registration form ----
      if (data.validateOnly) {
        if (!data.referralCode) return json({ ok: false, error: "Referral code is required." }, 200);
        const r = await resolveReferral(supabase, data.referralCode);
        if ("error" in r) return json({ ok: false, error: r.error }, 200);
        return json({ ok: true, upline: r.upline }, 200);
      }

      // ---- Full registration ----
      const uname = String(data.username || "").trim().toLowerCase();
      if (!uname) return json({ error: "Username is required." }, 400);
      if (!data.password) return json({ error: "Password is required." }, 400);
      if (!data.referralCode) return json({ error: "Referral code is required." }, 400);

      const r = await resolveReferral(supabase, data.referralCode);
      if ("error" in r) return json({ error: r.error }, 400);
      const { referralId, referredByUser } = r;

      // ---- Username availability ----
      const { data: existing } = await supabase
        .from("users").select("id").eq("username", uname).maybeSingle();
      if (existing) return json({ error: "Username already taken." }, 409);

      // ---- Email availability ----
      const emailVal = data.email || "";
      if (emailVal) {
        const { data: existingEmail } = await supabase
          .from("users").select("id").eq("email", emailVal).maybeSingle();
        if (existingEmail) return json({ error: "Email already registered." }, 409);
      }

      // ---- Create user ----
      const passwordHash = await bcrypt.hash(data.password, 10);
      const uuid = crypto.randomUUID();
      const refCode = generateRefCode();

      const userInsert: Record<string, unknown> = {
        id: uuid,
        username: uname,
        password_hash: passwordHash,
        display_name: data.displayName || uname,
        email: emailVal,
        phone: data.phone || "",
        country: data.country || "Indonesia",
        role: "user",
        account_status: "PENDING",
        registration_status: "PENDING_VERIFICATION",
        login_status: "LOCKED",
        referral_code: refCode,
        bank_name: data.bankName || "",
        bank_account_number: data.bankAccountNumber || "",
        bank_account_name: data.bankAccountName || "",
        kyc_status: "PENDING",
      };
      if (referralId) userInsert.referred_by = referralId;
      if (referredByUser) userInsert.referred_by_user = referredByUser;

      const { error: insertErr } = await supabase.from("users").insert(userInsert);
      if (insertErr) {
        if (insertErr.code === "23505") return json({ error: "Username already taken." }, 409);
        console.error("[USER-REGISTER] Insert error:", insertErr.message);
        return json({ error: insertErr.message || "Registration failed." }, 500);
      }

      // Atomically increment referral used_count (system codes only)
      if (referralId) {
        const { error: incErr } = await supabase.rpc("increment_referral_used", { p_referral_id: referralId });
        if (incErr) console.warn("[USER-REGISTER] increment_referral_used failed:", incErr.message);
      }

      // Create wallet
      const { error: walletErr } = await supabase.from("wallet").insert({ user_id: uuid });
      if (walletErr) console.warn("[USER-REGISTER] wallet create failed:", walletErr.message);

      // Store KYC documents
      const kyc = data.kyc || {};
      const kycDocs: { document_type: string; document_url: string }[] = [];
      if (kyc.docImage) kycDocs.push({ document_type: kyc.documentType || "ID Document", document_url: kyc.docImage });
      if (kyc.selfieImage) kycDocs.push({ document_type: "Selfie", document_url: kyc.selfieImage });
      if (kycDocs.length) {
        const { error: kycErr } = await supabase
          .from("kyc_documents")
          .insert(kycDocs.map(d => ({ user_id: uuid, ...d, status: "PENDING" })));
        if (kycErr) console.warn("[USER-REGISTER] kyc insert failed:", kycErr.message);
      }

      console.info(`[USER-REGISTER] New user registered: ${uname} (${uuid})`);

      return json({
        ok: true,
        user: { uuid, username: uname, referralCode: refCode, referredByCode: data.referralCode },
        message: "Registration successful. Awaiting admin approval.",
      });

    } catch (error) {
      console.error("[USER-REGISTER] Exception:", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
}
