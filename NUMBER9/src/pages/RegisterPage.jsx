import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store/useStore";
import { Icon } from "../components/icons";
import { useI18n } from "../i18n";
import ModalOverlay from "../components/ui/ModalOverlay";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const inp =
  "w-full h-10 rounded-lg border border-[#1f2128] bg-[#0e1117] px-3 text-base sm:text-sm text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400/70";
const lbl =
  "block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1";



export default function RegisterPage() {
  const auth = useStore((s) => s.auth);
  const findUserByReferralCodeAsync = useStore((s) => s.findUserByReferralCodeAsync);
  const registerUser = useStore((s) => s.registerUser);
  const completeRegistration = useStore((s) => s.completeRegistration);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    username: "",
    country: "Indonesia",
    password: "",
    confirmPassword: "",
    referral: "",
    documentType: "id",
    docImage: null,
    selfieImage: null,
    bankName: "",
    bankAccountNumber: "",
    bankAccountName: "",
  });
  const [step, setStep] = useState(1);
  const [showThankYou, setShowThankYou] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(null);
  const [upline, setUpline] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingUuid, setPendingUuid] = useState(null);
  const { t } = useI18n();

  useEffect(() => {
    if (auth?.id) navigate(`/c/${auth.id}/dashboard`, { replace: true });
  }, [auth, navigate]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const refSeq = useRef(0);
  const onRefChange = (val) => {
    set("referral", val);
    if (!val.trim()) { setUpline(null); return; }
    const seq = ++refSeq.current;
    setTimeout(async () => {
      const u = await findUserByReferralCodeAsync(val);
      if (refSeq.current !== seq) return;
      setUpline(u ? { displayName: u.displayName, username: u.username, code: u.referralCode } : null);
    }, 300);
  };

  const onFile = async (k, file) => {
    if (!file || fileLoading) return;
    setFileLoading(true);
    try {
      set(k, await readFileAsDataUrl(file));
    } catch {
      setError(t('register.image_read_error'));
    } finally {
      setFileLoading(false);
    }
  };

  const validateStep1 = () => {
    const v = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      username: form.username.trim().toLowerCase(),
      password: form.password,
      confirmPassword: form.confirmPassword,
      referral: form.referral.trim().toUpperCase(),
    };
    if (
      !v.fullName || !v.email || !v.phone || !v.username ||
      !v.password || !v.confirmPassword || !v.referral
    )
      return t('register.validation_required');
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(v.username))
      return t('register.validation_username');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email))
      return t('register.validation_email');
    if (v.password.length < 6)
      return t('register.validation_password');
    if (v.password !== v.confirmPassword)
      return t('register.validation_password_match');
    return null;
  };

  const validateStep2 = () => {
    if (!form.bankName.trim() || !form.bankAccountNumber.trim() || !form.bankAccountName.trim())
      return t('register.validation_bank');
    if (!form.docImage || !form.selfieImage)
      return t('register.validation_photos');
    return null;
  };

  const goToStep2 = () => {
    if (submitting) return;
    setError("");
    const err = validateStep1();
    if (err) return setError(err);
    setSubmitting(true);

    const v = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      username: form.username.trim().toLowerCase(),
      country: form.country.trim() || "Indonesia",
      password: form.password,
      referral: form.referral.trim().toUpperCase(),
    };

    registerUser({
      username: v.username,
      password: v.password,
      displayName: v.fullName,
      email: v.email,
      phone: v.phone,
      country: v.country,
      referralCode: v.referral,
    }).then((result) => {
      setSubmitting(false);
      if (!result || !result.ok)
        return setError((result && result.error) || t('register.registration_failed'));
      if (!result?.user?.uuid) return setError(t('register.registration_failed'));
      setPendingUuid(result.user.uuid);
      setShowThankYou(true);
    }).catch(() => {
      setSubmitting(false);
      setError(t('common.connection_error'));
    });
  };

  const proceedToStep2 = () => {
    setShowThankYou(false);
    setStep(2);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    const e2 = validateStep2();
    if (e2) return setError(e2);
    setSubmitting(true);

    const docLabel =
      form.documentType === "id"
        ? "National ID"
        : form.documentType === "passport"
          ? "Passport"
          : "Driver's License";

    completeRegistration(pendingUuid, {
      bankName: form.bankName,
      bankAccountNumber: form.bankAccountNumber,
      bankAccountName: form.bankAccountName,
      kyc: {
        documentType: docLabel,
        docImage: form.docImage,
        selfieImage: form.selfieImage,
        submittedAt: new Date().toISOString(),
      },
    }).then((result) => {
      setSubmitting(false);
      if (!result || !result.ok)
        return setError((result && result.error) || t('register.registration_failed'));
      setOk(pendingUuid);
    }).catch(() => {
      setSubmitting(false);
      setError(t('common.connection_error'));
    });
  };

  return (
    <div className="relative min-h-screen bg-[#050607] px-4 py-8 overflow-hidden">
      <button
        onClick={() => navigate('/')}
        className="fixed top-4 left-4 z-20 p-2 text-zinc-400 hover:text-white transition"
        title="Back"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Background Grid Pattern (distinctive) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(#ffffff03 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Hero Globe (subtle, left side) */}
      <img
        src="/assets/img/hero-globe.png"
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-full w-auto opacity-20"
        style={{ filter: 'drop-shadow(0 0 32px rgba(246,200,60,0.08))' }}
      />

      {/* Gradient Overlay */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-2/3"
        style={{
          background: 'linear-gradient(to right, #050607 0%, rgba(5,6,7,0.8) 50%, transparent 100%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-3xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <img
            src="/assets/img/number9-logo.png"
            alt="NUMBER9"
            className="mx-auto mb-4 h-8 w-auto"
          />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            {t('register.title')}
          </p>
        </div>

        {/* Step Indicator Pills */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
            step === 1
              ? 'bg-yellow-400 text-black'
              : 'bg-yellow-400/20 text-yellow-400'
          }`}>
            {t('register.step_account')}
          </div>
          <div className="h-px w-6 bg-[#1f2128]" />
          <div className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
            step === 2
              ? 'bg-yellow-400 text-black'
              : 'bg-[#1f2128] text-zinc-500'
          }`}>
            {t('register.step_bank')}
          </div>
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          {/* Gold Accent Top */}
          <div className="h-0.5 bg-linear-to-r from-yellow-400 via-yellow-400/40 to-transparent" />

          <div className="p-5 sm:p-6">
            <h2 className="text-base font-extrabold text-white">
              {step === 1 ? t('register.create_account') : t('register.bank_kyc')}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {step === 1
                ? t('register.referral_required')
                : t('register.bank_kyc_desc')}
            </p>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-400/30 bg-[#13151c] px-3 py-2.5">
                <span className="mt-0.5 text-yellow-400">
                  <Icon.Warn size={14} />
                </span>
                <p className="text-[12px] leading-relaxed text-yellow-200">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              {/* ============ STEP 1: ACCOUNT ============ */}
              {step === 1 && (
                <>
                  <div>
                    <label className={lbl} htmlFor="reg-referral">
                      {t('register.referral_code')} <span className="text-yellow-400">*</span>
                    </label>
                    <input
                      id="reg-referral"
                      className={inp}
                      value={form.referral}
                      onChange={(e) => onRefChange(e.target.value)}
                      placeholder={t('register.referral_placeholder')}
                    />
                    {form.referral && (
                      <p className={`mt-1 text-[11px] ${upline ? "text-yellow-400" : "text-zinc-500"}`}>
                        {upline ? (
                          <>{t('register.referral_upline', { name: upline.displayName, user: upline.username })}</>
                        ) : (
                          t('register.referral_invalid')
                        )}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={lbl} htmlFor="reg-fullname">{t('register.full_name')}</label>
                      <input id="reg-fullname" className={inp} value={form.fullName}
                        onChange={(e) => set("fullName", e.target.value)}
                        placeholder={t('register.full_name_placeholder')} autoComplete="name" />
                    </div>
                    <div>
                      <label className={lbl} htmlFor="reg-username">{t('register.username')}</label>
                      <input id="reg-username" className={inp} value={form.username}
                        onChange={(e) => set("username", e.target.value)}
                        placeholder={t('register.username_placeholder')} autoComplete="username" />
                    </div>
                    <div>
                      <label className={lbl} htmlFor="reg-email">{t('register.email')}</label>
                      <input id="reg-email" className={inp} type="email" value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        placeholder={t('register.email_placeholder')} autoComplete="email" />
                    </div>
                    <div>
                      <label className={lbl} htmlFor="reg-phone">{t('register.phone')}</label>
                      <input id="reg-phone" className={inp} type="tel" value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        placeholder={t('register.phone_placeholder')} autoComplete="tel" />
                    </div>
                    <div>
                      <label className={lbl} htmlFor="reg-country">{t('register.country')}</label>
                      <select id="reg-country" className={inp} value={form.country}
                        onChange={(e) => set("country", e.target.value)}>
                        {["Indonesia","Singapore","Malaysia","Thailand","Philippines","Vietnam","Hong Kong","Japan","Other"]
                          .map((c) => {
                            const k = c === "Hong Kong" ? 'hongkong' : c.toLowerCase();
                            return <option key={c} value={c}>{t('register.country_' + k)}</option>;
                          })}
                      </select>
                    </div>
                    <div className="hidden sm:block" />
                    <div>
                      <label className={lbl} htmlFor="reg-password">{t('register.password')}</label>
                      <div className="relative">
                        <input id="reg-password" className={inp} type={showPassword ? 'text' : 'password'} value={form.password}
                          onChange={(e) => set("password", e.target.value)}
                          placeholder={t('register.password_placeholder')} autoComplete="new-password" minLength={6} />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition hover:text-yellow-400"
                          tabIndex="-1"
                        >
                          {showPassword ? <Icon.Eye size={16} /> : <Icon.EyeOff size={16} />}
                        </button>
                      </div>
                      <p className="mt-1 text-[9px] text-zinc-600">{t('register.password_hint') || 'Min. 6 characters'}</p>
                    </div>
                    <div>
                      <label className={lbl} htmlFor="reg-confirm">{t('register.confirm_password')}</label>
                      <div className="relative">
                        <input id="reg-confirm" className={inp} type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword}
                          onChange={(e) => set("confirmPassword", e.target.value)}
                          placeholder={t('register.confirm_password_placeholder')} autoComplete="new-password" />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition hover:text-yellow-400"
                          tabIndex="-1"
                        >
                          {showConfirmPassword ? <Icon.Eye size={16} /> : <Icon.EyeOff size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button type="button" onClick={goToStep2} disabled={submitting}
                    className="h-11 w-full rounded-lg bg-yellow-400 text-sm font-extrabold text-black hover:bg-yellow-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" /> : t('register.continue')}
                  </button>
                </>
              )}

              {/* ============ STEP 2: BANK + KYC ============ */}
              {step === 2 && (
                <>
                  <div className="rounded-lg border border-[#1f2128] bg-[#13151c] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-yellow-400">
                      {t('register.bank_details')}
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className={lbl} htmlFor="reg-bankname">{t('register.bank_name')} <span className="text-yellow-400">*</span></label>
                        <input id="reg-bankname" className={inp} value={form.bankName}
                          onChange={(e) => set("bankName", e.target.value)} placeholder={t('register.bank_name_placeholder')} />
                      </div>
                      <div>
                        <label className={lbl} htmlFor="reg-banknum">{t('register.account_number')} <span className="text-yellow-400">*</span></label>
                        <input id="reg-banknum" className={inp} value={form.bankAccountNumber}
                          onChange={(e) => set("bankAccountNumber", e.target.value)} placeholder={t('register.account_number_placeholder')} />
                      </div>
                      <div>
                        <label className={lbl} htmlFor="reg-bankholder">{t('register.account_holder')} <span className="text-yellow-400">*</span></label>
                        <input id="reg-bankholder" className={inp} value={form.bankAccountName}
                          onChange={(e) => set("bankAccountName", e.target.value)} placeholder={t('register.account_holder_placeholder')} />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#1f2128] bg-[#13151c] p-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-yellow-400">
                      {t('register.kyc_documents')}
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className={lbl}>{t('register.document_type')}</label>
                        <select className={inp} value={form.documentType}
                          onChange={(e) => set("documentType", e.target.value)}>
                          <option value="id">{t('register.national_id')}</option>
                          <option value="passport">{t('register.passport')}</option>
                          <option value="driver">{t('register.drivers_license')}</option>
                        </select>
                      </div>
                      <div>
                        <label className={lbl}>{t('register.document_photo')}</label>
                        <input type="file" accept="image/*"
                          className="w-full text-[11px] text-zinc-300 file:mr-2 file:h-9 file:rounded file:border-0 file:bg-[#1a1d24] file:px-2.5 file:text-[11px] file:font-bold file:text-yellow-400 hover:file:bg-[#1f2128]"
                          onChange={(e) => onFile("docImage", e.target.files?.[0])} />
                        {form.docImage && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-yellow-400">
                            <Icon.Check size={11} /> {t('register.uploaded')}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className={lbl}>{t('register.selfie_photo')}</label>
                        <input type="file" accept="image/*"
                          className="w-full text-[11px] text-zinc-300 file:mr-2 file:h-9 file:rounded file:border-0 file:bg-[#1a1d24] file:px-2.5 file:text-[11px] file:font-bold file:text-yellow-400 hover:file:bg-[#1f2128]"
                          onChange={(e) => onFile("selfieImage", e.target.files?.[0])} />
                        {form.selfieImage && (
                          <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-yellow-400">
                            <Icon.Check size={11} /> {t('register.uploaded')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button type="button" data-no-loading
                      onClick={() => { setStep(1); setError(""); }}
                      className="h-11 shrink-0 rounded-lg border border-[#1f2128] bg-[#13151c] px-5 text-sm font-semibold text-zinc-300 hover:bg-[#1a1d24]">
                      {t('register.back')}
                    </button>
                    <button type="submit" disabled={submitting}
                      className="h-11 flex-1 rounded-lg bg-yellow-400 text-sm font-extrabold text-black hover:bg-yellow-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">
                      {submitting ? <span className="inline-flex items-center gap-1.5"><span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" /> {t('register.submitting')}</span> : t('register.submit')}
                    </button>
                  </div>
                  <p className="text-center text-[11px] text-zinc-500">
                    {t('register.approval_note')}
                  </p>
                </>
              )}
            </form>

            <p className="mt-4 text-center text-xs text-zinc-400">
              {t('auth.already_have_account')}{" "}
              <Link to="/login" className="font-bold text-yellow-400 hover:text-yellow-300">
                {t('auth.login_link')}
              </Link>
            </p>
          </div>

          {/* Footer */}
          <div className="border-t border-[#1f2128] px-5 py-3 text-center text-[11px] text-[#444]">
            {t('landing.footer')}
          </div>
        </div>
      </div>

      {/* ===== Thank You modal (after step 1) ===== */}
      {showThankYou && (
        <ModalOverlay open={showThankYou} onClose={() => setShowThankYou(false)} className="items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-[#0e1017] p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-yellow-400 text-black">
                <Icon.Check size={24} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-yellow-400">
                  {t('register.step1_complete')}
                </p>
                <h2 className="text-lg font-extrabold text-white">{t('register.thank_you')}</h2>
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-zinc-300">
              {t('register.step1_desc')}
            </p>
            <button onClick={proceedToStep2} data-no-loading
              className="mt-5 h-10 w-full rounded-lg bg-yellow-400 text-sm font-extrabold text-black hover:bg-yellow-300">
              {t('register.continue_bank')}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ===== Pending Verification modal (after submit) ===== */}
      {ok && (
        <ModalOverlay open={!!ok} onClose={() => setOk(null)} className="items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-[#0e1017] p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-yellow-400 text-black">
                <Icon.Check size={24} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-yellow-400">
                  {t('register.pending_verification')}
                </p>
                <h2 className="text-lg font-extrabold text-white">{t('register.registration_submitted')}</h2>
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-zinc-300">
              {t('register.registration_done', { user: "" })}
            </p>
            <ul className="mt-3 space-y-1 text-[12px] text-zinc-400">
              <li>
                <span className="font-bold text-zinc-300">{t('register.registration_label')}</span>{" "}
                <span className="text-yellow-400">PENDING_VERIFICATION</span>
              </li>
              <li>
                <span className="font-bold text-zinc-300">{t('register.login_label')}</span>{" "}
                <span className="text-yellow-400">LOCKED</span>
              </li>
              <li>
                <span className="font-bold text-zinc-300">{t('register.uuid_label')}</span>{" "}
                <span className="font-mono text-[10px] text-zinc-200">{ok}</span>
              </li>
            </ul>
            <p className="mt-4 rounded-lg border border-white/[0.04] bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-zinc-400">
              {t('register.code_pending')}
            </p>
            <div className="mt-5 flex gap-2">
              <Link to="/login"
                className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-yellow-400 text-sm font-extrabold text-black hover:bg-yellow-300">
                {t('auth.back_to_login')}
              </Link>
              <Link to="/"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm font-semibold text-zinc-300 hover:bg-white/[0.06]">
                {t('common.home')}
              </Link>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
