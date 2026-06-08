import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../store/useStore";
import { Icon } from "../components/icons";
import { useI18n } from '../i18n';
import { wibDate } from '../utils/wib';
import { fetchTurnoverSummary } from '../store/wallet';
import PageShell from '../components/ui/PageShell';
import { formatNumber } from '../utils/format';

const fmt = (n) => formatNumber(n);

export default function ProfilePage() {
  const auth         = useStore((s) => s.auth);
  const { clientUuid } = useParams();
  const p = (path) => `/c/${clientUuid}${path}`;
  const fetchProfile = useStore((s) => s.fetchProfile);
  const [loading, setLoading] = useState(true);
  const [turnover, setTurnover] = useState(null);
  const [me, setMe] = useState({});
  const { t } = useI18n();

  useEffect(() => {
    let isMounted = true;
    fetchProfile()
      .then((data) => {
        if (isMounted) {
          if (data) setMe((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => { if (isMounted) setLoading(false); });
    fetchTurnoverSummary(auth.id).then((d) => { if (isMounted) setTurnover(d); }).catch(() => {});
    return () => { isMounted = false; };
  }, [auth?.id, fetchProfile]);

  const userName = me.displayName || auth?.displayName || auth?.username || "User";
  const uid      = me.uuid || auth?.id || "";
  const username = me.username || auth?.username || "";
  const email    = me.email || auth?.email || "";
  const phone    = me.phone || auth?.phone || "";
  const country  = me.country || "";
  const role     = me.role || "user";
  const acct     = me.accountStatus || me.account_status || "ACTIVE";
  const kyc      = me.kycStatus || me.kyc_status || "PENDING";
  const code     = me.referralCode || "";
  const referred = me.referredByCode || "";
  const bank     = me.bankName || "";
  const bankAcct = me.bankAccountNumber || "";
  const bankName = me.bankAccountName || "";

  const joinDate = wibDate(me.createdAt)

  const isKycApproved = kyc === "APPROVED";
  const KYC = [
    { l: t('profile.email'),          done: isKycApproved, icon: Icon.FileText },
    { l: t('profile.phone'),          done: isKycApproved, icon: Icon.Phone },
    { l: t('profile.id_verify'),      done: isKycApproved, icon: Icon.ID },
    { l: t('profile.address_verify'), done: isKycApproved, icon: Icon.Security },
  ];

  if (loading) return <LoadingSkeleton />;

  return (
    <PageShell back={{ to: p('/dashboard'), label: t('profile.back') }}>

      <div className="relative overflow-hidden rounded-2xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="h-32 sm:h-44 bg-gradient-to-br from-yellow-400/20 via-yellow-400/5 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(250,204,21,0.08),transparent_70%)]" />
        <div className="relative -mt-14 sm:-mt-16 flex items-end gap-4 px-4 sm:px-6 pb-4 sm:pb-5">
          <span className="grid h-16 w-16 sm:h-20 sm:w-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-yellow-400 to-yellow-500 text-2xl sm:text-3xl font-black text-black shadow-lg shadow-yellow-400/20 ring-2 ring-[#0c0e14]">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0 pt-12 sm:pt-14">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-white truncate">{userName}</h1>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${acct === "ACTIVE" ? "bg-emerald-400/15 text-emerald-400" : "bg-zinc-700/50 text-zinc-400"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${acct === "ACTIVE" ? "bg-emerald-400" : "bg-zinc-500"}`} />
                {acct === "ACTIVE" ? t('common.active') : acct}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
              @{username} <span className="mx-1.5">·</span> {t('profile.member_since')} {joinDate}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('profile.user_id'),   value: uid.slice(0, 8).toUpperCase() || "—", icon: Icon.ID },
          { label: t('profile.role'),      value: role.replace("_", " "),              icon: Icon.User },
          { label: t('profile.referral'),  value: code || "—",                         icon: Icon.Coin },
          { label: t('profile.status'),    value: acct,                                 icon: Icon.Shield },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-[#1f2128] bg-[#0c0e14] px-3.5 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-yellow-400/10 text-yellow-400">
              <s.icon size={15} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{s.label}</p>
              <p className="text-sm font-extrabold truncate text-white">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        <Section icon={Icon.User} title={t('profile.account_data')}>
          <Row l={t('profile.username')}      v={username || "—"} />
          <Row l={t('profile.display_name')}  v={userName} />
          <Row l={t('profile.email')}         v={email || "—"} />
          <Row l={t('profile.phone')}         v={phone || "—"} />
          <Row l={t('profile.country')}       v={country || "—"} />
          <Row l={t('profile.member_since')}  v={joinDate} />
        </Section>

        <Section icon={Icon.Bank} title={t('profile.bank_details')}>
          <Row l={t('profile.bank_name')}    v={bank || "—"} />
          <Row l={t('profile.account_no')}   v={bankAcct || "—"} mono />
          <Row l={t('profile.account_name')} v={bankName || "—"} />
        </Section>

        {turnover && (
          <Section icon={Icon.Turnover} title={t('turnover.title')}>
            <Row l={t('turnover.deposit')} v={fmt(turnover.totalDeposited) + ' P'} />
            <Row l={t('turnover.required')} v={fmt(turnover.required) + ' P'} />
            <Row l={t('turnover.done')} v={fmt(turnover.achieved) + ' P'} />
            {turnover.remaining > 0 && (
              <Row l={t('turnover.remaining')} v={fmt(turnover.remaining) + ' P'} />
            )}
            <div className="px-4 py-3">
              <div className="h-2 overflow-hidden rounded-full bg-[#1f2128]">
                <div className="h-full bg-yellow-400 transition-all duration-700" style={{ width: `${turnover.pct}%` }} />
              </div>
              {turnover.remaining > 0 ? (
                <p className="mt-1 text-[10px] text-zinc-500">{t('turnover.to_unlock')}</p>
              ) : (
                <p className="mt-1 text-[10px] text-emerald-400">✓ {t('turnover.unlocked')}</p>
              )}
            </div>
          </Section>
        )}

        <Section icon={Icon.Shield} title={t('profile.verification')}>
          <div className="grid grid-cols-2 gap-0 sm:grid-cols-4">
            {KYC.map((s) => (
              <div key={s.l} className="flex flex-col items-center gap-1.5 py-3 px-1 border-r last:border-r-0 border-[#1f2128]">
                <span className={`grid h-7 w-7 rounded-full place-items-center text-xs font-extrabold ${s.done ? "bg-yellow-400 text-black" : "border border-[#1f2128] text-zinc-600"}`}>
                  {s.done ? <Icon.Check size={11} /> : <s.icon size={11} />}
                </span>
                <span className={`text-[8px] font-bold text-center leading-tight ${s.done ? "text-white" : "text-zinc-600"}`}>{s.l}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section icon={Icon.Coin} title={t('profile.referral_program')}>
          {code ? (
            <div className="space-y-2 p-3">
              <div className="flex items-center justify-between rounded-lg border border-yellow-400/20 bg-yellow-400/5 px-3 py-2">
                <span className="text-[11px] text-zinc-400">{t('profile.your_code')}</span>
                <span className="font-mono text-base font-black tracking-[0.25em] text-yellow-400">{code}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>{t('profile.referred_by')}</span>
                <span className="font-mono text-zinc-400">{referred || "—"}</span>
              </div>
              <Link to={p('/referral')} className="block w-full rounded-lg bg-yellow-400 py-2 text-center text-[11px] font-extrabold text-black hover:bg-yellow-300 transition active:scale-[0.99]">
                {t('profile.manage_referrals')}
              </Link>
            </div>
          ) : (
            <div className="text-center py-2">
              <Icon.Coin size={22} className="mx-auto text-zinc-600 mb-1.5" />
              <p className="text-[11px] text-zinc-500">{t('profile.code_pending')}</p>
            </div>
          )}
        </Section>

      </div>
    </PageShell>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-xl border border-[#1f2128] bg-[#0c0e14] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[#1f2128] px-3 py-2.5">
        <Icon size={12} className="text-yellow-400" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">{title}</p>
      </div>
      <div className="divide-y divide-[#1f2128]">{children}</div>
    </div>
  );
}

function Row({ l, v, mono }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-[11px] font-medium text-zinc-500">{l}</span>
      <span className={`text-[13px] font-bold text-white truncate ml-3 ${mono ? "font-mono tracking-wider" : ""}`}>{v}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 lg:py-6 space-y-5 animate-pulse">
      <div className="h-4 w-28 rounded bg-[#1f2128]" />
      <div className="rounded-2xl border border-[#1f2128] bg-[#0c0e14] overflow-hidden">
        <div className="h-32 sm:h-44 bg-[#13151c]" />
        <div className="flex items-end gap-4 px-4 sm:px-6 pb-4 sm:pb-5 -mt-14 sm:-mt-16">
          <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-[#1f2128]" />
          <div className="flex-1 pt-12 sm:pt-14 space-y-2">
            <div className="h-5 w-40 rounded bg-[#1f2128]" />
            <div className="h-3 w-56 rounded bg-[#1f2128]" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-[#0c0e14] border border-[#1f2128]" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-48 rounded-xl bg-[#0c0e14] border border-[#1f2128]" />
        ))}
      </div>
    </div>
  );
}
