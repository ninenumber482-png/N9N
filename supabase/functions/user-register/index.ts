import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'

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

const ch = (req: Request) => ({
  "Access-Control-Allow-Origin": corsOrigin(req),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Credentials": "true",
});

const json = (body: unknown, status = 200, req: Request) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...ch(req) } });

const generateRefCode = () => "N9-USER-" + Math.random().toString(36).substring(2, 7).toUpperCase();

type SupaClient = ReturnType<typeof createClient>;

async function resolveReferral(supabase: SupaClient, rawCode: string) {
  const normCode = String(rawCode).trim().toUpperCase();
  const { data: refOwner } = await supabase.from("users")
    .select("id,username,display_name,account_status,referral_code")
    .eq("referral_code", normCode).maybeSingle();
  if (refOwner) {
    if (refOwner.account_status !== "ACTIVE") return { error: "Referral code belongs to an inactive account." };
    return { referralId: null, referredByUser: refOwner.id, upline: { uuid: refOwner.id, username: refOwner.username, displayName: refOwner.display_name, referralCode: refOwner.referral_code } };
  }
  const { data: refData } = await supabase.from("referrals")
    .select("id,code,status,expires_at,max_uses,used_count,created_by")
    .eq("code", normCode).maybeSingle();
  if (!refData) return { error: "Referral code is invalid." };
  if (refData.status !== "ACTIVE") return { error: "Referral code is inactive." };
  if (refData.expires_at && new Date(refData.expires_at) < new Date()) return { error: "Referral code has expired." };
  if (refData.max_uses != null && refData.used_count >= refData.max_uses) return { error: "Referral code usage limit reached." };
  let creator: any = null;
  if (refData.created_by) {
    const { data } = await supabase.from("users").select("id,username,display_name").eq("id", refData.created_by).maybeSingle();
    creator = data;
  }
  return {
    referralId: refData.id, referredByUser: refData.created_by,
    upline: { uuid: creator?.id || refData.created_by, username: creator?.username || "NUMBER9", displayName: creator?.display_name || "NUMBER9 Platform", referralCode: refData.code },
  };
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ch(req) });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, req);

    try {
      const data = await req.json();
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('N9_SERVICE_ROLE_KEY')
      if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfiguration' }, 500, req)
      const supabase = createClient(supabaseUrl, serviceRoleKey)

      // ── Maintenance firewall — blokir registrasi baru saat maintenance ──
      const { data: maintRow } = await supabase
        .from('platform_config').select('value').eq('key', 'maintenance_mode').maybeSingle();
      if (maintRow?.value === 'true') {
        const { data: msgRow } = await supabase
          .from('platform_config').select('value').eq('key', 'maintenance_msg').maybeSingle();
        return json({
          error: 'MAINTENANCE_MODE',
          message: msgRow?.value || 'Platform sedang maintenance. Coba lagi nanti.',
        }, 503, req);
      }

      // ── Rate limiting for registrations ──
      if (!data.validateOnly && data.step !== 2 && data.username) {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
        const cutoff = new Date(Date.now() - 3600000).toISOString(); // 1 hour
        const { count } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .or(`username.eq.${data.username},email.eq.${data.email || '__none__'}`)
          .gte('created_at', cutoff);
        if ((count || 0) >= 3) {
          return json({ error: 'Too many registration attempts. Please try again later.' }, 429, req);
        }
      }

      // ── validateOnly: referral preview ──
      if (data.validateOnly) {
        if (!data.referralCode) return json({ ok: false, error: "Referral code is required." }, 200, req);
        const r = await resolveReferral(supabase, data.referralCode);
        if ("error" in r) return json({ ok: false, error: r.error }, 200, req);
        return json({ ok: true, upline: r.upline }, 200, req);
      }

      // ── Step 2: update bank + KYC for existing user ──
      if (data.step === 2) {
        if (!data.uuid) return json({ error: "UUID is required." }, 400, req);
        const { error: updateErr } = await supabase.from("users").update({
          bank_name: data.bankName || "",
          bank_account_number: data.bankAccountNumber || "",
          bank_account_name: data.bankAccountName || "",
        }).eq("id", data.uuid);
        if (updateErr) return json({ error: updateErr.message }, 500, req);

        const kyc = data.kyc || {};
        const kycDocs: { document_type: string; document_url: string }[] = [];
        if (kyc.docImage) kycDocs.push({ document_type: kyc.documentType || "ID Document", document_url: kyc.docImage });
        if (kyc.selfieImage) kycDocs.push({ document_type: "Selfie", document_url: kyc.selfieImage });
        if (kycDocs.length) {
          const { error: kycErr } = await supabase.from("kyc_documents").insert(kycDocs.map(d => ({ user_id: data.uuid, ...d, status: "PENDING" })));
          if (kycErr) return json({ error: kycErr.message }, 500, req);
        }

        return json({ ok: true, message: "Bank and KYC updated." }, 200, req);
      }

      // ── Step 1: create user (full registration) ──
      const uname = String(data.username || "").trim().toLowerCase();
      if (!uname) return json({ error: "Username is required." }, 400, req);
      if (!data.password) return json({ error: "Password is required." }, 400, req);
      if (!data.referralCode) return json({ error: "Referral code is required." }, 400, req);

      const r = await resolveReferral(supabase, data.referralCode);
      if ("error" in r) return json({ error: r.error }, 400, req);
      const { referralId, referredByUser } = r;

      const { data: existing } = await supabase.from("users").select("id").eq("username", uname).maybeSingle();
      if (existing) return json({ error: "Username already taken." }, 409, req);

      const emailVal = data.email || "";
      if (emailVal) {
        const { data: existingEmail } = await supabase.from("users").select("id").eq("email", emailVal).maybeSingle();
        if (existingEmail) return json({ error: "Email already registered." }, 409, req);
      }

      const { default: bcrypt } = await import('npm:bcryptjs@2.4.3');
      const passwordHash = await bcrypt.hash(data.password, 10);
      const uuid = crypto.randomUUID();
      const refCode = generateRefCode();
      const userInsert: Record<string, unknown> = {
        id: uuid, username: uname, password_hash: passwordHash,
        display_name: data.displayName || uname, email: emailVal, phone: data.phone || "",
        country: data.country || "Indonesia", role: "user",
        account_status: "PENDING", registration_status: "PENDING_VERIFICATION", login_status: "LOCKED",
        referral_code: refCode,
        bank_name: data.bankName || "", bank_account_number: data.bankAccountNumber || "", bank_account_name: data.bankAccountName || "",
        kyc_status: "PENDING",
      };
      if (referralId) userInsert.referred_by = referralId;
      if (referredByUser) userInsert.referred_by_user = referredByUser;

      const { error: insertErr } = await supabase.from("users").insert(userInsert);
      if (insertErr) {
        if (insertErr.code === "23505") return json({ error: "Username already taken." }, 409, req);
        return json({ error: insertErr.message || "Registration failed." }, 500, req);
      }
      if (referralId) {
        const { error: incErr } = await supabase.rpc("increment_referral_used", { p_referral_id: referralId });
        if (incErr) console.warn("[USER-REGISTER] increment_referral_used failed:", incErr.message);
      }
      const { error: walletErr } = await supabase.from("wallet").insert({ user_id: uuid });
      if (walletErr) console.warn("[USER-REGISTER] wallet create failed:", walletErr.message);

      const kyc = data.kyc || {};
      const kycDocs: { document_type: string; document_url: string }[] = [];
      if (kyc.docImage) kycDocs.push({ document_type: kyc.documentType || "ID Document", document_url: kyc.docImage });
      if (kyc.selfieImage) kycDocs.push({ document_type: "Selfie", document_url: kyc.selfieImage });
      if (kycDocs.length) {
        const { error: kycErr } = await supabase.from("kyc_documents").insert(kycDocs.map(d => ({ user_id: uuid, ...d, status: "PENDING" })));
        if (kycErr) console.warn("[USER-REGISTER] kyc insert failed:", kycErr.message);
      }

      return json({
        ok: true,
        user: { uuid, username: uname, referralCode: refCode, referredByCode: data.referralCode },
        message: "Registration successful. Awaiting admin approval.",
      }, 200, req);

    } catch (error) {
      console.error("[USER-REGISTER] Exception:", error);
      return json({ error: "Internal server error" }, 500, req);
    }
});
