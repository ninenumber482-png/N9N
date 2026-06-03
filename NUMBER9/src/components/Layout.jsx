import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, Link, useParams } from "react-router-dom";
import { useStore } from "../store/useStore";
import { Icon } from "./icons";
import { useI18n } from "../i18n";
import ConfirmDialog from "./ui/ConfirmDialog";
import SystemNotification from "./ui/SystemNotification";
import CsWidget from "./ui/CsWidget";
import { PageSkeleton } from "./ui/Skeleton";

function useLayoutBalance() {
  const availableBalance = useStore((s) => s.availableBalance);
  return useMemo(() => availableBalance || 0, [availableBalance]);
}

const NAV = [
  { k: "dashboard", l: "nav.overview", p: "dashboard", I: Icon.Grid, bottom: true },
  { k: "king", l: "nav.marketplace", p: "king", I: Icon.Crown, bottom: true },
  { k: "wallet", l: "nav.wallet", p: "wallet", I: Icon.Wallet, bottom: true },
  { k: "turnover", l: "nav.turnover", p: "turnover", I: Icon.Turnover },
  { k: "history", l: "nav.history", p: "history", I: Icon.History, bottom: true },
  { k: "deposit", l: "nav.deposit", p: "deposit", I: Icon.Download, bottom: true },
  { k: "withdraw", l: "nav.withdraw", p: "withdraw", I: Icon.Upload },
  { k: "trading", l: "nav.media", p: "trading", I: Icon.Bell },
  { k: "network", l: "nav.network", p: "network", I: Icon.Users },
  { k: "profile", l: "nav.profile", p: "profile", I: Icon.User },
];

export default function Layout({ children }) {
  const loc = useLocation();
  const auth = useStore((s) => s.auth);
  const hydrated = useStore((s) => s._hydrated);
  const logout = useStore((s) => s.logout);
  const systemStatus = useStore((s) => s.systemStatus);
  const nav = useNavigate();
  const { clientUuid } = useParams();
  const prefix = useMemo(() => `/c/${clientUuid || ''}`, [clientUuid]);
  const pg = loc.pathname.split('/').pop() || "dashboard";
  const [routeLoading, setRouteLoading] = useState(false);
  const prevLoc = useRef(loc.pathname);
  useEffect(() => {
    if (prevLoc.current !== loc.pathname) {
      setRouteLoading(true);
      prevLoc.current = loc.pathname;
      const t = setTimeout(() => setRouteLoading(false), 300);
      return () => clearTimeout(t);
    }
    prevLoc.current = loc.pathname;
  }, [loc.pathname]);
  const bleed = pg === "king";
  const { t, lang, setLang } = useI18n();
  const [showLogout, setShowLogout] = useState(false);
  const name = auth?.displayName || auth?.username || "User";
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const balanceMain = useLayoutBalance();

  // Read maintenance status from realtime systemStatus (synced via App.jsx)
  const maintenance = systemStatus?.platformMaintenance || false;
  const maintenanceMsg = systemStatus?.platformMsg || '';

  const NAV_FULL = useMemo(() => NAV.map(n => ({ ...n, p: `${prefix}/${n.p}` })), [prefix]);

  useEffect(() => {
    if (hydrated && !auth) nav("/login", { replace: true });
  }, [auth, hydrated, nav]);

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050607]">
        <div className="flex flex-col items-center gap-4">
          <img src="/assets/img/number9-logo.png" alt="NUMBER9" className="h-12 w-auto animate-pulse" />
          <p className="text-sm font-semibold text-zinc-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!auth) return null;

  // Maintenance mode — lock all pages
  if (maintenance) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0c12] px-6 text-center">
        <div className="text-6xl mb-6">🔧</div>
        <h1 className="text-2xl font-bold text-white mb-3">Under Maintenance</h1>
        <p className="text-zinc-400 max-w-md text-sm">
          {maintenanceMsg || 'The platform is currently undergoing scheduled maintenance. Please check back later.'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#050607] text-white flex flex-col lg:flex-row">
      {/* MOBILE HEADER */}
      <header className="sticky top-0 z-30 border-b border-[#1f2128] bg-[#050607]/95 backdrop-blur-md lg:hidden">
        <div className="h-1 bg-linear-to-r from-yellow-400 via-yellow-400/40 to-transparent" />
        <div className="flex h-16 items-center justify-between px-5">
          <Link to={`${prefix}/dashboard`}>
            <img src="/assets/img/number9-logo.png" alt="NUMBER9" className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
              className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 hover:border-yellow-400/50 hover:text-yellow-400 transition"
            >
              {lang === 'id' ? 'EN' : 'ID'}
            </button>
            <span className="rounded-lg bg-yellow-400/10 border border-yellow-400/20 px-3 py-1.5 text-xs font-bold text-yellow-400">
              {balanceMain.toLocaleString()} {t('common.points')}
            </span>
            <button
              onClick={() => setShowLogout(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1f2128] text-zinc-400 hover:text-red-400 hover:border-red-400/40 transition"
              title={t('nav.logout')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
            <Link to={`${prefix}/profile`} className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-yellow-400 to-yellow-500 text-xs font-bold text-black hover:shadow-lg hover:shadow-yellow-400/30 transition">
              {initials}
            </Link>
          </div>
        </div>
      </header>

      <SystemNotification />

      {/* MAIN CONTENT - FULL WIDTH */}
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col lg:flex-row">
        {/* LEFT SIDEBAR - NAVIGATION + USER INFO - DESKTOP ONLY */}
        <aside className="hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:flex-col lg:border-r lg:border-[#1f2128] lg:bg-[#0c0e14]">
          <div className="absolute top-0 left-0 h-1 w-full bg-linear-to-r from-yellow-400 via-yellow-400/40 to-transparent" />
          <div className="flex items-center justify-center h-16 border-b border-[#1f2128]">
            <Link to={`${prefix}/dashboard`}>
              <img src="/assets/img/number9-logo.png" alt="NUMBER9" className="h-7 w-auto" />
            </Link>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {NAV_FULL.map((n) => {
              const active = pg === n.k;
              return (
                <Link
                  key={n.k}
                  to={n.p}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                    active
                      ? "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                  }`}
                >
                  <n.I size={20} />
                  <span className="truncate">{t(n.l)}</span>
                </Link>
              );
            })}
          </nav>

          {/* Bottom section: user info + utilities */}
          <div className="p-3 border-t border-[#1f2128] space-y-2">
            <Link to={`${prefix}/profile`} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition group">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-black group-hover:shadow-lg group-hover:shadow-yellow-400/30 transition">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{name}</p>
              </div>
            </Link>
            <div className="flex gap-1">
              <button
                onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
                className="flex-1 py-2 rounded-lg border border-[#1f2128] hover:border-yellow-400/40 hover:bg-yellow-400/5 text-xs font-semibold text-zinc-400 hover:text-yellow-400 transition"
              >
                {lang === 'id' ? 'EN' : 'ID'}
              </button>
              <button
                onClick={() => setShowLogout(true)}
                className="flex-1 py-2 rounded-lg border border-[#1f2128] hover:border-red-400/40 hover:bg-red-400/5 text-xs font-semibold text-zinc-400 hover:text-red-400 transition"
              >
                {t('nav.logout')}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#1f2128_transparent] [overscroll-behavior:contain]">
          {/* Full-bleed routes (marketplace terminal) own their own padding;
              all other pages get the shared, uniform page padding here. */}
          <div className={bleed ? "w-full" : "w-full px-4 pt-4 pb-28 sm:px-6 sm:pt-8 sm:pb-28 lg:px-10 lg:py-10"}>
            {routeLoading ? <PageSkeleton /> : children}
          </div>
        </div>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-[#1f2128] bg-[#050607]/95 backdrop-blur-md lg:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="h-1 bg-linear-to-r from-transparent via-yellow-400/40 to-transparent" />
        <div className="grid grid-cols-6 gap-1 px-2 py-3">
          {NAV_FULL.filter(n => n.bottom).slice(0, 5).map((n) => {
            const active = pg === n.k;
            return (
              <Link
                key={n.k}
                to={n.p}
                className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl transition-all duration-200 ${active
                    ? "text-yellow-400 bg-yellow-400/10 border border-yellow-400/20"
                    : "text-zinc-600 hover:text-zinc-300 hover:bg-white/5"
                  }`}
              >
                <n.I size={22} />
                <span className="text-[9px] font-bold truncate">{t(n.l)}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setShowLogout(true)}
            className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl transition-all duration-200 text-zinc-600 hover:text-red-400 hover:bg-red-400/5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="text-[9px] font-bold truncate">{t('nav.logout')}</span>
          </button>
        </div>
      </nav>

      <ConfirmDialog
        open={showLogout}
        title={t('nav.logout')}
        message={t('common.logout_confirm')}
        onConfirm={() => { setShowLogout(false); logout(); }}
        onCancel={() => setShowLogout(false)}
      />
      <CsWidget />
    </div>
  );
}
