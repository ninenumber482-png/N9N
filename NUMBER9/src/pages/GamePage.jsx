import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../store/useStore";
import { Icon } from "../components/icons";
import { withTimeout } from "../utils/asyncHelpers";
import { useI18n } from '../i18n';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ModalOverlay from '../components/ui/ModalOverlay';
import useTimer, { fmtTimer } from "../hooks/useTimer";
import {
  sessionAt, getSettled, refreshKingData,
  listBidsForSession, listBids, listSettledRecent,
  placeBid, PAYOUT, getPreviousSessionCode,
  sessionStatusAt, toWIBCode, SESSION_DURATION_MS,
  setKingUser,
} from "../store/king";

const STAKE_PRESETS = [100, 500, 1000, 5000];
const NUMBERS = Array.from({ length: 28 }, (_, i) => i);

const clampPrice = (n) => Math.max(0, Math.min(27, n));

/* Live "index" series driving the chart + ticker (cosmetic market feel). */
function useMarketPrice() {
  const [series, setSeries] = useState(() => {
    let p = 8 + Math.random() * 11;
    return Array.from({ length: 48 }, () => (p = clampPrice(p + (Math.random() - 0.5) * 2.6)));
  });
  useEffect(() => {
    const t = setInterval(() => {
      setSeries((s) => [...s.slice(1), clampPrice(s[s.length - 1] + (Math.random() - 0.5) * 2.6)]);
    }, 1200);
    return () => clearInterval(t);
  }, []);
  const price = Math.round(series[series.length - 1]);
  const prev = Math.round(series[series.length - 2]);
  return { price, prev, up: price > prev, down: price < prev, series };
}

/* SVG sparkline / area chart for the index series. */
function MarketChart({ series, up }) {
  const w = 100, h = 100;
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => [
    (i / (series.length - 1)) * w,
    h - ((v - min) / span) * (h - 8) - 4,
  ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const stroke = up ? "#34d399" : "#f87171";
  const fill = up ? "rgba(52,211,153,0.14)" : "rgba(248,113,113,0.12)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

const STATUS_CONFIG = {
  OPEN: { labelKey: "status_open", color: "text-emerald-400", dot: "bg-emerald-400", bar: "bg-emerald-400" },
  LOCKED: { labelKey: "status_locked", color: "text-red-400", dot: "bg-red-400", bar: "bg-red-400" },
  RESULTING: { labelKey: "status_drawing", color: "text-violet-400", dot: "bg-violet-400", bar: "bg-violet-400" },
  SETTLED: { labelKey: "status_settled", color: "text-zinc-400", dot: "bg-zinc-500", bar: "bg-zinc-500" },
  RESET: { labelKey: "status_resetting", color: "text-zinc-500", dot: "bg-zinc-600", bar: "bg-zinc-600" },
};

export default function GamePage() {
  const { t } = useI18n();
  const { clientUuid } = useParams();
  const cp = (path) => `/c/${clientUuid}${path}`;
  const [showEntry, setShowEntry] = useState(() => {
    try { return localStorage.getItem('n9_marketplace_entry_shown') !== 'true'; } catch { return true; }
  });
  const [entryLoading, setEntryLoading] = useState(false);
  const now = useTimer(); // Shared timer from context
  const [bigSmall, setBigSmall] = useState(null);
  const [oddEven, setOddEven] = useState(null);
  const [number, setNumber] = useState(null);
  const [stake, setStake] = useState(100);
  const [custom, setCustom] = useState("");
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);
  const [bidding, setBidding] = useState(false);
  const [resultModal, setResultModal] = useState(null); // { win, pnl, bids }
  const [approvalStatus, setApprovalStatus] = useState(null); // { ok, count, error }
  const [lastSubmittedStake, setLastSubmittedStake] = useState(0);
  const prevBidStatus = useRef({});
  const auth = useStore((s) => s.auth);
  const balance = useStore((s) => s.availableBalance);
  const fetchBalances = useStore((s) => s.fetchBalances);
  const kingVersion = useStore((s) => s._kingVersion || 0);
  const { price, prev: prevPrice, up, down, series } = useMarketPrice();

  /* Session is computed locally from UTC clock — matches the backend's
     session code scheme (YYYYMMDDHHmm at 5-min boundaries). The resultTime
     is also the lookup key for king_results.session_code, so local computation
     is sufficient. */
  const session = useMemo(() => sessionAt(now), [now]);

  useEffect(() => { setKingUser(auth?.id); }, [auth?.id]);

  // Load initial data on mount
  useEffect(() => {
    if (!auth?.id) return;
    refreshKingData(auth.id).then(() => setVersion((v) => v + 1));
    fetchBalances();
  }, [auth?.id, fetchBalances]);

  // Sync king.js cache updates (from App.jsx polling) to local version counter
  useEffect(() => {
    if (kingVersion > 0) {
      refreshKingData(auth?.id).then(() => setVersion((v) => v + 1));
    }
  }, [kingVersion]);

  // Subscribe to realtime bet settlements via App.jsx (App.jsx watches _kingVersion)

  useEffect(() => {
    // reset selections on new session — deferred to avoid synchronous setState in effect
    const t = setTimeout(() => {
      setBigSmall(null); setOddEven(null); setNumber(null); setStakeOpen(false);
    }, 0);
    return () => clearTimeout(t);
  }, [session.sessionCode]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  /* Detect when PENDING bids become SETTLED → show win/loss modal (polling fallback) */
  useEffect(() => {
    const all = listBids();
    const newlySettled = all.filter((b) => {
      const prev = prevBidStatus.current[b.clientBetId];
      const isSettled = prev === "PENDING" && b.status !== "PENDING" && b.result;
      const resultAvailable = !!getSettled(b.sessionCode);
      return isSettled && resultAvailable;
    });
    if (newlySettled.length > 0) {
      const pnl = newlySettled.reduce((s, b) => s + (b.payout || 0) - b.stake, 0);
      setResultModal({ win: pnl > 0, pnl, bids: newlySettled });
    }
    const map = {};
    all.forEach((b) => { map[b.clientBetId] = b.status; });
    prevBidStatus.current = map;
  }, [version]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bidsHere = useMemo(() => listBidsForSession(session.sessionCode), [session.sessionCode, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recentSettled = useMemo(() => listSettledRecent(10), [version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recentBids = useMemo(() => listBids().slice(0, 15), [version]);

  const pending = bidsHere.filter((b) => b.status === "PENDING");
  const hasPendingBS = pending.some((b) => b.betCode === "BIG" || b.betCode === "SMALL");
  const hasPendingOE = pending.some((b) => b.betCode === "ODD" || b.betCode === "EVEN");
  const pendingNumCode = pending.find((b) => b.betCode?.startsWith("TOTAL_"))?.betCode ?? null;

  const selections = [...(bigSmall ? [bigSmall] : []), ...(oddEven ? [oddEven] : []), ...(number !== null ? [number] : [])];
  const eff = Number(custom) || stake;
  const totalStake = eff * selections.length;
  const maxPayout =
    (bigSmall ? eff * PAYOUT.BIG_SMALL : 0) +
    (oddEven ? eff * PAYOUT.ODD_EVEN : 0) +
    (number !== null ? eff * PAYOUT.NUMBER : 0);

  const isOpen = session.status === "OPEN";
  const isLocked = session.status === "LOCKED";
  const isResulting = session.status === "RESULTING";
  const sc = STATUS_CONFIG[session.status] || STATUS_CONFIG.RESET;

  /* Progress bar: fraction of 5-min slot elapsed */
  const slotFrac = Math.min(1, session.msSinceOpen / SESSION_DURATION_MS);

  const countdown = isOpen ? session.msToLock : isLocked ? session.msToResult : isResulting ? session.msToSettle : session.msToEnd;

  const askConfirm = () => {
    if (!isOpen) return setToast({ type: "err", text: t('game.market_closed') });
    if (!selections.length) return setToast({ type: "err", text: t('game.select_contract') });
    if (eff <= 0) return setToast({ type: "err", text: t('game.enter_amount') });
    if (totalStake > balance) return setToast({ type: "err", text: t('game.insufficient_balance') });
    setConfirm(true);
  };

  const doSubmit = async () => {
    setBidding(true);
    setLastSubmittedStake(eff);
    try {
      const r = await withTimeout(
        placeBid({ sessionCode: session.sessionCode, selections, stake: eff, username: auth?.username, userId: auth?.id }),
        10000
      );
      setBidding(false);

      if (!r.ok) {
        if (r.error === 'UNAUTHORIZED') {
          // Token is stale — show a clear error and let the session validator
          // (useStore.fetchProfile path) handle the auto-logout. The bet was
          // never placed; user can simply log in again to retry.
          setApprovalStatus({ ok: false, error: t('game.session_expired') || "Session expired. Please login again." });
          return;
        }
        setApprovalStatus({ ok: false, error: r.error });
        return;
      }

      // Bid placed successfully - show approval status
      setApprovalStatus({ ok: true, count: r.count });
      fetchBalances();
      setBigSmall(null); setOddEven(null); setNumber(null); setCustom(""); setStakeOpen(false);
      // No manual setVersion bump — placeBid() in king.js now bumps
      // _kingVersion, which triggers the kingVersion useEffect above to
      // re-run refreshKingData + setVersion. Single refresh path.
    } catch (err) {
      setBidding(false);
      const errorMsg = err.message === 'Request timeout'
        ? t('game.timeout')
        : t('game.bid_failed');
      setApprovalStatus({ ok: false, error: errorMsg });
    }
  };

  const systemStatus = useStore((s) => s.systemStatus);

  /* Entry confirmation dialog */
  if (showEntry) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <ConfirmDialog
          open
          title={t('marketplace.entry_title') || "Enter Marketplace?"}
          message={t('marketplace.entry_message') || "You are about to enter the Settlement Marketplace. Do you want to proceed?"}
          loading={entryLoading}
          confirmText={t('marketplace.entry_confirm') || "Enter"}
          cancelText={t('common.cancel')}
          onConfirm={() => {
            setEntryLoading(true);
            setTimeout(() => {
              try { localStorage.setItem('n9_marketplace_entry_shown', 'true'); } catch {}
              setEntryLoading(false);
              setShowEntry(false);
            }, 1200);
          }}
          onCancel={() => {
            try { localStorage.setItem('n9_marketplace_entry_shown', 'true'); } catch {}
            setShowEntry(false);
          }}
        />
      </div>
    );
  }

  /* King marketplace closed/maintenance block */
  if (systemStatus.kingStatus !== 'OPEN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <div className="text-6xl mb-6">
          {systemStatus.kingStatus === 'MAINTENANCE' ? '🔧' : '🔒'}
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">
          {systemStatus.kingStatus === 'MAINTENANCE' ? t('game.maintenance') : t('game.closed')}
        </h2>
        <p className="text-gray-400 max-w-md">
          {systemStatus.kingStatusMsg || t('game.check_back')}
        </p>
      </div>
    );
  }

  return (
    <div className="relative bg-[#0a0c12]">
      <Link to={cp('/dashboard')} className="absolute left-4 top-4 z-50 inline-flex items-center gap-1 text-zinc-500 transition hover:text-white">
        <span>←</span><span className="text-xs font-semibold">{t('common.back')}</span>
      </Link>
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(250,204,21,0.06),transparent_70%)]" />

      {/* ── Top Bar ── */}
      <div className="sticky top-0 z-40 border-b border-[#1f2128] bg-[#0c0e14]/90 backdrop-blur-md">
        <div className="h-px w-full bg-linear-to-r from-transparent via-yellow-400/30 to-transparent" />
        <div className="w-full px-3 sm:px-4 lg:px-6 2xl:px-10">

          {/* Stat grid — wraps on mobile, single row on desktop */}
          <div className="grid grid-cols-2 gap-px bg-[#1f2128] sm:grid-cols-3 lg:grid-cols-5">

            {/* Market price */}
            <div className="min-w-0 bg-[#0c0e14] px-3 py-2.5 sm:px-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">{t('game.market')}</p>
              <div className="flex items-baseline gap-1.5">
                <span className={`font-mono text-xl font-black tabular-nums sm:text-2xl ${up ? "text-emerald-400" : down ? "text-red-400" : "text-white"}`}>{price}</span>
                <span className={`text-xs font-bold ${up ? "text-emerald-400" : down ? "text-red-400" : "text-zinc-600"}`}>{up ? "▲" : down ? "▼" : "—"}</span>
              </div>
            </div>

            {/* Session */}
            <div className="min-w-0 bg-[#0c0e14] px-3 py-2.5 sm:px-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">{t('game.session')}</p>
              <p className="truncate font-mono text-xs font-black text-white sm:text-sm">{session.displayCode}</p>
            </div>

            {/* Status */}
            <div className="min-w-0 bg-[#0c0e14] px-3 py-2.5 sm:px-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">{t('game.status')}</p>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${sc.dot} ${isOpen ? "animate-pulse" : ""}`} />
                <span className={`truncate text-sm font-black ${sc.color}`}>{t('game.' + sc.labelKey)}</span>
              </div>
            </div>

            {/* Countdown */}
            <div className="min-w-0 bg-[#0c0e14] px-3 py-2.5 sm:px-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">
                {isOpen ? t('game.closes_in') : isLocked ? t('game.result_in') : isResulting ? t('game.settling') : t('game.next_in')}
              </p>
              <p className="font-mono text-sm font-black text-white">{fmtTimer(countdown)}</p>
            </div>

            {/* Balance */}
            <div className="col-span-2 min-w-0 bg-[#0c0e14] px-3 py-2.5 text-left sm:col-span-1 sm:px-4 sm:text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">{t('game.balance')}</p>
              <p className="font-mono text-sm font-black text-yellow-400">{balance.toLocaleString()} {t('common.points')}</p>
            </div>
          </div>

          {/* 5-min slot progress — full-width strip */}
          <div className="flex items-center gap-3 border-t border-[#1f2128] py-2">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-zinc-600">{t('game.session_progress')}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#1f2128]">
              <div className={`h-full rounded-full transition-all duration-1000 ${sc.bar}`} style={{ width: `${slotFrac * 100}%` }} />
            </div>
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-zinc-600">{t('game.slots_5min')}</span>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="relative z-10 w-full px-3 py-4 pb-20 sm:px-4 lg:px-6 lg:pb-8 2xl:px-10">

        {/* ── Live index chart (trading terminal) ── */}
        <div className="mb-3 overflow-hidden rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          <div className="flex items-stretch">
            <div className="flex flex-col justify-between border-r border-[#1f2128] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{t('game.n9_index')}</span>
                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> {t('game.live')}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className={`font-mono text-3xl font-black tabular-nums ${up ? "text-emerald-400" : down ? "text-red-400" : "text-white"}`}>{price.toFixed(2)}</span>
                <span className={`text-xs font-extrabold tabular-nums ${up ? "text-emerald-400" : down ? "text-red-400" : "text-zinc-500"}`}>
                  {up ? "▲" : down ? "▼" : "—"} {Math.abs(price - prevPrice).toFixed(2)}
                </span>
              </div>
              <p className="mt-0.5 text-[9px] text-zinc-600">{t('game.settlement_index', { code: session.displayCode })}</p>
            </div>
            <div className="h-20 flex-1">
              <MarketChart series={series} up={up} />
            </div>
          </div>
        </div>

        {/* Arena strip — full width, embedded in top of grid */}
        <ArenaStage session={session} now={now} />

        {/* TWO merged panels */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px] 2xl:grid-cols-[1fr_440px]">

          {/* ══ LEFT — one card, all betting ══ */}
          <div className="overflow-hidden rounded-xl border border-[#1f2128] bg-linear-to-b from-[#0e1117] to-[#0b0d13] shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">

            {/* Card header */}
            <div className="flex items-center justify-between border-b border-[#1f2128] bg-[#0c0e14]/40 px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-yellow-400">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 shadow-[0_0_6px_1px_rgba(250,204,21,0.6)]" />
                {t('game.open_position')}
              </p>
              <div className="flex items-center gap-2">
                {!isOpen && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
                    <Icon.Lock size={11} /> {isLocked ? t('game.locked') : isResulting ? t('game.drawing') : t('game.preparing')}
                  </span>
                )}
                <span className="text-[9px] text-zinc-600">{session.displayCode}</span>
              </div>
            </div>

            <div className="p-4">
              <div className={!isOpen ? "pointer-events-none opacity-40" : ""}>

                {/* Big / Small */}
                <Label>{t('game.big_small')}</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <BetBtn label={t('game.big')} active={bigSmall === "BIG"} color="emerald" disabled={!isOpen || hasPendingBS || (bigSmall && bigSmall !== "BIG")} onClick={() => { setBigSmall(bigSmall === "BIG" ? null : "BIG"); if (isOpen) setStakeOpen(true); }} />
                  <BetBtn label={t('game.small')} active={bigSmall === "SMALL"} color="red" disabled={!isOpen || hasPendingBS || (bigSmall && bigSmall !== "SMALL")} onClick={() => { setBigSmall(bigSmall === "SMALL" ? null : "SMALL"); if (isOpen) setStakeOpen(true); }} />
                </div>

                {/* Odd / Even */}
                <Label className="mt-3">{t('game.odd_even')}</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <BetBtn label={t('game.odd')} active={oddEven === "ODD"} color="emerald" disabled={!isOpen || hasPendingOE || (oddEven && oddEven !== "ODD")} onClick={() => { setOddEven(oddEven === "ODD" ? null : "ODD"); if (isOpen) setStakeOpen(true); }} />
                  <BetBtn label={t('game.even')} active={oddEven === "EVEN"} color="red" disabled={!isOpen || hasPendingOE || (oddEven && oddEven !== "EVEN")} onClick={() => { setOddEven(oddEven === "EVEN" ? null : "EVEN"); if (isOpen) setStakeOpen(true); }} />
                </div>

                {/* Numbers */}
                <Label className="mt-3">{t('game.total_number')}</Label>
                <div className="mt-1.5 grid grid-cols-7 gap-1 sm:grid-cols-[repeat(14,minmax(0,1fr))]">
                  {NUMBERS.map((n) => (
                    <button key={n}
                      disabled={!isOpen || (pendingNumCode && pendingNumCode !== `TOTAL_${n}`) || (number !== null && number !== n)}
                      onClick={() => { setNumber(number === n ? null : n); if (isOpen) setStakeOpen(true); }}
                      className={`h-9 rounded-md border text-[11px] font-extrabold tabular-nums transition-all duration-150 active:scale-90 disabled:opacity-30 ${number === n ? "border-yellow-400 bg-yellow-400 text-black shadow-[0_0_16px_-3px_rgba(250,204,21,0.7)]" : "border-[#1f2128] bg-[#13151c] text-zinc-300 hover:border-yellow-400/40 hover:bg-yellow-400/5 hover:text-white"
                        }`}
                    >{n}</button>
                  ))}
                </div>
              </div>

              {toast && (
                <div className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-bold ${toast.type === "ok" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" : "border-red-500/20 bg-red-500/5 text-red-400"}`}>
                  {toast.type === "ok" ? <Icon.Check size={12} /> : <Icon.Warn size={12} />} {toast.text}
                </div>
              )}
            </div>
          </div>

          {/* ══ RIGHT — one card, all live data ══ */}
          <div className="overflow-hidden rounded-xl border border-[#1f2128] bg-linear-to-b from-[#0e1117] to-[#0b0d13] shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
            <div className="h-px w-full bg-linear-to-r from-yellow-400/40 via-transparent to-transparent" />
            <BidHistoryInline bids={recentBids.slice(0, 5)} />
            <div className="border-t border-[#1f2128]" />
            <SessionBetsInline session={session} bids={bidsHere} />
            <div className="border-t border-[#1f2128]" />
            <RecentResultsInline recent={recentSettled.slice(0, 5)} />
          </div>

        </div>

        {/* ── Footer ── */}
        <footer className="mt-6 border-t border-[#1f2128] pt-5">
          <div className="h-px w-full bg-linear-to-r from-yellow-400/30 via-transparent to-transparent" />
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <img src="/assets/img/number9-logo.png" alt="NUMBER9" className="h-6 w-auto" />
              <span className="text-[10px] text-zinc-600">{t('game.settlement_marketplace')}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> {t('game.engine_live')}</span>
              <Link to={cp('/turnover')} className="hover:text-yellow-400">{t('game.turnover')}</Link>
              <Link to={cp('/history')} className="hover:text-yellow-400">{t('game.history')}</Link>
              <Link to={cp('/support')} className="hover:text-yellow-400">{t('game.support')}</Link>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
            {t('game.disclaimer')}
          </p>
          <p className="mt-2 text-[9px] text-zinc-700">{t('game.copyright')}</p>
        </footer>
      </div>

      {/* ── Stake Modal ── */}
      {stakeOpen && (
        <ModalOverlay open={stakeOpen} onClose={() => setStakeOpen(false)} className="items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[#1f2128] bg-[#0c0e14]">
            {/* Top accent */}
            <div className="h-1 w-full shrink-0 bg-linear-to-r from-yellow-400 via-yellow-400/40 to-transparent" />
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[#1f2128] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg border border-yellow-400/30 bg-yellow-400/10 text-yellow-400"><Icon.Trade size={15} /></span>
                <div>
                  <p className="text-[13px] font-extrabold text-white">{t('game.set_investment')}</p>
                  <p className="text-[10px] text-zinc-500">{t('game.order_ticket', { code: session.displayCode })}</p>
                </div>
              </div>
              <button onClick={() => setStakeOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#1f2128] text-zinc-500 hover:text-white">
                <Icon.Close size={13} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {/* Buying power */}
              <div className="flex items-center justify-between rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{t('game.buying_power')}</span>
                <span className="font-mono text-[12px] font-extrabold text-yellow-400">{balance.toLocaleString()} {t('common.points')}</span>
              </div>

              {/* Selected contracts */}
              <div>
                <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">{t('game.contracts_count', { count: selections.length })}</p>
                <div className="flex flex-wrap gap-1.5">
                  {selections.length === 0
                    ? <span className="text-[10px] text-zinc-600">{t('game.no_contract')}</span>
                    : selections.map((s, i) => (
                      <span key={i} className="flex items-center gap-1 rounded border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 font-mono text-[11px] font-bold text-yellow-400">
                        {typeof s === "number" ? t('game.selected_total', { n: s }) : s}
                      </span>
                    ))
                  }
                </div>
              </div>

              {/* Investment presets */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{t('game.investment_per_contract')}</p>
                  <button type="button" onClick={() => setCustom(String(Math.max(0, Math.floor(balance))))} className="text-[9px] font-bold uppercase tracking-widest text-yellow-400 hover:text-yellow-300">{t('game.max')}</button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {STAKE_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => { setStake(v); setCustom(""); }}
                      aria-label={`${t('game.set_investment')} ${v.toLocaleString()} ${t('common.points')}`}
                      aria-pressed={stake === v && !custom}
                      className={`h-10 rounded-lg border text-[12px] font-extrabold tabular-nums transition ${stake === v && !custom ? "border-yellow-400 bg-yellow-400 text-black" : "border-[#1f2128] bg-[#13151c] text-zinc-300 hover:border-yellow-400/40"
                        }`}
                    >{v.toLocaleString()}</button>
                  ))}
                </div>
                <input type="number" inputMode="decimal" value={custom}
                  onChange={(e) => setCustom(e.target.value)} placeholder={t('game.custom_amount')}
                  className="mt-2 h-10 w-full rounded-lg border border-[#1f2128] bg-[#13151c] px-3 text-[12px] font-bold text-white outline-none focus:border-yellow-400/40 placeholder:text-zinc-700" />
              </div>

              {/* Order summary */}
              <div className="rounded-lg border border-[#1f2128] bg-[#13151c] divide-y divide-[#1f2128]">
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] text-zinc-500">{t('game.investment_label')}</span>
                  <span className="font-mono text-[12px] font-bold text-zinc-300">{eff.toLocaleString()} {t('common.points')}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] text-zinc-500">{t('game.total_invested')}</span>
                  <span className="font-mono text-[13px] font-extrabold text-white">{totalStake.toLocaleString()} {t('common.points')}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] text-zinc-500">{t('game.projected_return')}</span>
                  <span className="font-mono text-[13px] font-extrabold text-yellow-400">{maxPayout.toLocaleString()} {t('common.points')}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] text-zinc-500">{t('game.est_roi')}</span>
                  <span className="font-mono text-[12px] font-extrabold text-emerald-400">
                    {totalStake > 0 ? `+${Math.round(((maxPayout - totalStake) / totalStake) * 100)}%` : "—"}
                  </span>
                </div>
              </div>

            </div>

            {/* Footer (pinned) */}
            <div className="shrink-0 space-y-3 border-t border-[#1f2128] p-5">
              {totalStake > balance && (
                <p className="flex items-center gap-1.5 text-[10px] font-bold text-red-400">
                  <Icon.Warn size={11} /> {t('game.exceeds_buying_power')}
                </p>
              )}

              {/* CTA */}
              <button
                type="button"
                onClick={() => { setStakeOpen(false); askConfirm(); }}
                disabled={!selections.length || eff <= 0 || totalStake > balance}
                aria-label={`${t('game.open_position')} ${totalStake.toLocaleString()} ${t('common.points')}`}
                className="h-12 w-full rounded-xl bg-yellow-400 text-[14px] font-extrabold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t('game.open_position')} · {totalStake.toLocaleString()} {t('common.points')}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Win / Loss Modal ── */}
      {resultModal && (
        <ModalOverlay open={!!resultModal} onClose={() => setResultModal(null)} className="items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xs overflow-hidden rounded-2xl border bg-[#0c0e14]"
            role="document"
            style={{ borderColor: resultModal.win ? "rgb(52 211 153 / 0.3)" : "rgb(248 113 113 / 0.3)" }}>
            {/* Top accent bar */}
            <div className={`h-1 w-full ${resultModal.win ? "bg-emerald-400" : "bg-red-400"}`} />
            <div className="p-6 text-center">
              <p className={`text-[11px] font-bold uppercase tracking-widest ${resultModal.win ? "text-emerald-400" : "text-red-400"}`}>
                {resultModal.win ? t('game.in_profit') : t('game.in_loss')}
              </p>
              <p className={`mt-2 text-5xl font-black tabular-nums ${resultModal.win ? "text-emerald-400" : "text-red-400"}`}>
                {resultModal.win ? "+" : ""}{resultModal.pnl.toLocaleString()}
              </p>
              <p className="text-sm font-bold text-zinc-400">{t('game.points')}</p>

              <div className="mt-4 space-y-1">
                {resultModal.bids.map((b, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-1.5">
                    <span className="font-mono text-[11px] font-bold text-yellow-400">{b.betCode}</span>
                    <span className={`text-[11px] font-bold ${b.result === "WIN" ? "text-emerald-400" : "text-red-400"}`}>
                      {b.result === "WIN" ? `+${(b.payout - b.stake).toLocaleString()}` : `-${b.stake.toLocaleString()}`} {t('common.points')}
                    </span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setResultModal(null)}
                aria-label={`${t('game.in_profit')} / ${t('game.in_loss')}`}
                className={`mt-5 h-11 w-full rounded-xl font-extrabold text-sm transition ${resultModal.win ? "bg-emerald-400 text-black hover:bg-emerald-300" : "bg-red-500 text-white hover:bg-red-400"}`}
              >
                {resultModal.win ? t('common.done') : t('common.try_again')}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Approval Status Modal ── */}
      {approvalStatus && (
        <ModalOverlay open={!!approvalStatus} onClose={() => setApprovalStatus(null)} className="items-center justify-center bg-black/70 p-4">
          <div className={`w-full max-w-sm overflow-hidden rounded-2xl border bg-[#0c0e14] ${approvalStatus.ok ? "border-emerald-400/30" : "border-red-400/30"
            }`}>
            {/* Top accent bar */}
            <div className={`h-1 w-full ${approvalStatus.ok ? "bg-emerald-400" : "bg-red-400"}`} />

            <div className="p-6 text-center">
              <p className={`text-[11px] font-bold uppercase tracking-widest ${approvalStatus.ok ? "text-emerald-400" : "text-red-400"
                }`}>
                {approvalStatus.ok ? t('game.position_opened') : t('game.order_rejected')}
              </p>

              <p className={`mt-3 text-4xl font-black ${approvalStatus.ok ? "text-emerald-400" : "text-red-400"
                }`}>
                {approvalStatus.ok ? "✓" : "!"}
              </p>

              {approvalStatus.ok ? (
                <div className="mt-4 space-y-2">
                  <p className="text-[12px] text-zinc-300">
                    {t('game.positions_opened', { count: approvalStatus.count })}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {t('game.invested', { amount: (lastSubmittedStake || eff).toLocaleString() })}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {t('game.turnover_credited')}
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-[12px] text-red-300">{approvalStatus.error}</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setApprovalStatus(null);
                  setConfirm(false);
                }}
                className={`mt-5 h-11 w-full rounded-xl font-extrabold text-sm transition ${approvalStatus.ok
                    ? "bg-emerald-400 text-black hover:bg-emerald-300"
                    : "bg-red-500 text-white hover:bg-red-400"
                  }`}
              >
                {approvalStatus.ok ? t('common.continue') : t('common.try_again')}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Confirm Modal ── */}
      {confirm && !approvalStatus && (
        <ModalOverlay open={confirm && !approvalStatus} onClose={() => setConfirm(false)} className="items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[#1f2128] bg-[#0c0e14]"
            role="document">
            <div className="border-b border-[#1f2128] px-5 py-3">
              <p id="confirm-title" className="text-[13px] font-extrabold text-white">{t('game.confirm_order')}</p>
              <p className="text-[10px] text-zinc-500">{session.displayCode}</p>
            </div>
            <div className="divide-y divide-[#1f2128]">
              <MRow l={t('game.contracts')} v={selections.map((s) => typeof s === "number" ? t('game.selected_total', { n: s }) : t('game.' + s.toLowerCase())).join(" · ")} />
              <MRow l={t('game.per_contract')} v={`${eff.toLocaleString()} ${t('common.points')}`} />
              <MRow l={t('game.total_invested')} v={`${totalStake.toLocaleString()} ${t('common.points')}`} bold />
              <MRow l={t('game.max_return')} v={`${maxPayout.toLocaleString()} ${t('common.points')}`} accent />
            </div>
            <div className="flex gap-2 p-4">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                aria-label={t('common.cancel')}
                className="h-10 flex-1 rounded-lg border border-[#1f2128] text-[12px] font-bold text-zinc-300 transition hover:text-white"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={doSubmit}
                disabled={bidding}
                aria-label={`${t('game.confirm_order')} ${t('common.points')}`}
                aria-busy={bidding}
                className="h-10 flex-1 rounded-lg bg-yellow-400 text-[12px] font-extrabold text-black transition hover:bg-yellow-300 disabled:opacity-60"
              >
                {bidding ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" /> {t('game.opening')}
                  </span>
                ) : t('common.confirm')}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

/* ── Arena Stage ── */
function ArenaStage({ session, now }) {
  const cur = getSettled(session.sessionCode);
  const latest = listSettledRecent(1)[0];
  const prev = getPreviousSessionCode(session.sessionCode);
  const prevSt = sessionStatusAt(prev, now);
  const prevR = getSettled(prev);
  const prevDisplay = "N9K-" + toWIBCode(prev);

  /* 1. Current session is drawing — always show drawing first */
  if (session.status === "RESULTING")
    return <DrawingView code={session.displayCode} />;

  /* 2. Current session already has a result — show it */
  if (cur) return <ResultReveal key={cur.sessionCode} result={cur} />;

  /* 3. Previous session is live-drawing (current session hasn't settled yet) */
  if (prevSt === "RESULTING")
    return <DrawingView code={prevDisplay} />;

  /* 4. Previous session result exists — brief transition display */
  if ((prevSt === "SETTLED" || prevSt === "ENDED") && prevR)
    return <ResultReveal key={prevR.sessionCode} result={prevR} />;

  /* 5. Previous session ended but no result yet */
  if (prevSt === "ENDED" && !prevR)
    return <PendingResult code={prevDisplay} />;

  /* 6. Latest settled result (fallback) */
  if (latest) return <ResultReveal key={latest.sessionCode} result={latest} />;

  return <EngineState session={session} />;
}

/* Shared dark arena shell — gradient top accent + header row. */
function ArenaShell({ accent = "yellow", dot, label, code, children }) {
  const accents = {
    yellow: "from-yellow-400/70",
    emerald: "from-emerald-400/70",
    violet: "from-violet-400/70",
    zinc: "from-zinc-600/70",
  };
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-[#1f2128] bg-linear-to-b from-[#0e1117] to-[#0b0d13] shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <div className={`h-px w-full bg-linear-to-r ${accents[accent]} via-transparent to-transparent`} />
      <div className="flex items-center justify-between border-b border-[#1f2128] px-5 py-2.5">
        <div className="flex items-center gap-2">{dot}<p className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-200">{label}</p></div>
        <span className="max-w-28 truncate font-mono text-[10px] font-bold text-zinc-600 sm:max-w-none">{code}</span>
      </div>
      {children}
    </div>
  );
}

const ArenaCell = ({ l, children }) => (
  <div className="flex flex-1 flex-col items-center justify-center px-4 py-4">
    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{l}</p>
    {children}
  </div>
);

function PendingResult({ code }) {
  const { t } = useI18n();
  return (
    <ArenaShell accent="yellow" code={code} label={t('game.awaiting_result')}
      dot={<span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400 shadow-[0_0_8px_2px_rgba(250,204,21,0.5)]" />}>
      <div className="flex divide-x divide-[#1f2128]">
        {[t('common.total'), t('game.big_small'), t('game.odd_even'), t('game.number')].map((l) => (
          <ArenaCell key={l} l={l}><p className="mt-1 font-mono text-2xl font-black text-zinc-700">?</p></ArenaCell>
        ))}
      </div>
    </ArenaShell>
  );
}

function EngineState({ session }) {
  const { t } = useI18n();
  const isOpen = session.status === "OPEN";
  return (
    <ArenaShell accent={isOpen ? "emerald" : "zinc"} code={session.displayCode}
      label={isOpen ? t('game.session_open') : t('game.engine_resetting')}
      dot={<span className={`h-2 w-2 rounded-full ${isOpen ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]" : "bg-zinc-600"}`} />}>
      <div className="flex divide-x divide-[#1f2128]">
        <ArenaCell l={t('game.status')}>
          <p className={`mt-1 text-[13px] font-extrabold ${isOpen ? "text-emerald-400" : "text-zinc-500"}`}>{isOpen ? t('game.open') : t('common.waiting')}</p>
        </ArenaCell>
        {[t('common.total'), t('game.big_small'), t('game.odd_even'), t('game.number')].map((l) => (
          <ArenaCell key={l} l={l}><p className="mt-1 font-mono text-2xl font-black text-zinc-700">—</p></ArenaCell>
        ))}
      </div>
    </ArenaShell>
  );
}

function DrawingView({ code }) {
  const { t } = useI18n();
  return (
    <ArenaShell accent="violet" code={code} label={t('game.drawing_result')}
      dot={<span className="h-2 w-2 animate-pulse rounded-full bg-violet-400 shadow-[0_0_8px_2px_rgba(167,139,250,0.5)]" />}>
      <div className="flex items-center gap-6 px-5 py-4">
        <div className="flex items-center gap-2"><SpinDigit /> <SpinDigit /> <SpinDigit /></div>
        <div className="border-l border-[#1f2128] pl-6">
          <p className="text-[11px] font-bold text-zinc-500">{t('game.engine_drawing')}</p>
          <p className="text-[13px] font-extrabold text-violet-400">{t('game.publishing')}</p>
        </div>
        <div className="ml-auto hidden gap-4 sm:flex">
          {[t('common.total'), t('game.big_small_abbr'), t('game.odd_even_abbr')].map((l) => (
            <div key={l} className="text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{l}</p>
              <p className="mt-1 font-mono text-lg font-black text-zinc-700">—</p>
            </div>
          ))}
        </div>
      </div>
    </ArenaShell>
  );
}

function SpinDigit() {
  const [n, setN] = useState(() => Math.floor(Math.random() * 10));
  useEffect(() => {
    const t = setInterval(() => setN(Math.floor(Math.random() * 10)), 45);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="grid h-14 w-10 place-items-center rounded-xl border border-violet-400/30 bg-violet-400/10 font-mono text-2xl font-black text-violet-300 sm:h-16 sm:w-12 sm:text-3xl">
      {n}
    </span>
  );
}

function ResultReveal({ result }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    /* Smooth reveal: 0→1→2→3 over ~3 seconds, then stats drop in */
    setRevealed(0); setShowStats(false); setCelebrate(false);
    const t1 = setTimeout(() => setRevealed(1), 600);
    const t2 = setTimeout(() => setRevealed(2), 1400);
    const t3 = setTimeout(() => setRevealed(3), 2200);
    const t4 = setTimeout(() => setShowStats(true), 2800);
    const t5 = setTimeout(() => setCelebrate(true), 3200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, [result.sessionCode]);

  const bigUp = result.bigSmall === "BIG";
  const oddUp = result.oddEven === "ODD";
  return (
    <ArenaShell accent="yellow" code={result.displayCode} label={t('game.last_result')}
      dot={<span className="h-2 w-2 rounded-full bg-yellow-400 shadow-[0_0_8px_2px_rgba(250,204,21,0.5)]" />}>
      <div className="flex flex-wrap items-stretch gap-0 divide-x divide-[#1f2128]">
        {/* Digits block */}
        <div className="flex items-center gap-2 px-5 py-4">
          <Digit n={revealed >= 1 ? result.digit1 : null} delay={0} />
          <Digit n={revealed >= 2 ? result.digit2 : null} delay={1} />
          <Digit n={revealed >= 3 ? result.digit3 : null} delay={2} />
        </div>

        {/* Stats grid — shown after full reveal with smooth drop */}
        <div className={`flex flex-1 items-center divide-x divide-[#1f2128] transition-all duration-700 ease-out ${showStats ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{t('common.total')}</p>
            <p className={`font-mono text-3xl font-black text-white transition-transform duration-500 ${celebrate ? 'scale-110' : 'scale-100'}`}>{result.resultTotal}</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{t('game.big_small_short')}</p>
            <span className={`mt-1 rounded-lg px-3 py-1 text-[13px] font-extrabold uppercase tracking-widest transition-all duration-500 ${bigUp ? "bg-emerald-500 text-black" : "bg-red-500 text-white"} ${celebrate ? 'scale-110 shadow-lg' : 'scale-100'}`}>
              {result.bigSmall === 'BIG' ? t('game.big') : t('game.small')}
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{t('game.odd_even_short')}</p>
            <span className={`mt-1 rounded-lg px-3 py-1 text-[13px] font-extrabold uppercase tracking-widest transition-all duration-500 ${oddUp ? "bg-emerald-500 text-black" : "bg-red-500 text-white"} ${celebrate ? 'scale-110 shadow-lg' : 'scale-100'}`}>
              {result.oddEven === 'ODD' ? t('game.odd') : t('game.even')}
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{t('game.number')}</p>
            <p className={`font-mono text-3xl font-black text-white transition-transform duration-500 ${celebrate ? 'scale-110' : 'scale-100'}`}>{result.resultNumber ?? result.resultTotal}</p>
          </div>
        </div>
      </div>
    </ArenaShell>
  );
}

/* Each digit rolls fast then locks — combined with the staggered reveal above,
   the three numbers "come out" one by one like a draw machine. */
function Digit({ n, delay = 0 }) {
  const [shown, setShown] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    let iv;
    const t1 = setTimeout(() => {
      if (n === null) { setShown(null); setRolling(false); setLocked(false); return; }
      setRolling(true);
    }, delay * 200);
    if (n !== null) {
      iv = setInterval(() => setShown(Math.floor(Math.random() * 10)), 45);
    }
    const t2 = n !== null ? setTimeout(() => { clearInterval(iv); setShown(n); setRolling(false); setLocked(true); }, 360 + delay * 200) : null;
    return () => { clearTimeout(t1); if (t2) clearTimeout(t2); if (iv) clearInterval(iv); };
  }, [n, delay]);
  const empty = n === null;
  return (
    <span className={`grid h-14 w-10 place-items-center rounded-xl border font-mono text-2xl font-black transition-all duration-500 sm:h-16 sm:w-12 sm:text-3xl ${empty
        ? "scale-95 border-[#1f2128] bg-[#13151c] text-zinc-700"
        : rolling
          ? "scale-105 border-violet-400/50 bg-violet-400/10 text-violet-200"
          : locked
            ? "scale-110 border-yellow-400/60 bg-yellow-400/15 text-yellow-300 shadow-[0_0_20px_-2px_rgba(250,204,21,0.5)]"
            : "scale-100 border-yellow-400/40 bg-yellow-400/10 text-yellow-300 shadow-[0_0_14px_-2px_rgba(250,204,21,0.4)]"
      }`}>
      {empty ? "·" : shown}
    </span>
  );
}


/* ── Right panel sections (no outer card — already inside one) ── */
function SessionBetsInline({ session, bids }) {
  const { t } = useI18n();
  const pending = bids.filter((b) => b.status === "PENDING");
  const settled = bids.filter((b) => b.status !== "PENDING");
  const prev = getPreviousSessionCode(session.sessionCode);
  const prevBids = listBidsForSession(prev).filter((b) => b.status !== "PENDING");
  const allSettled = [...settled, ...prevBids];
  const netPnl = allSettled.reduce((s, b) => s + b.payout - b.stake, 0);
  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">{t('game.open_positions')}</p>
        <span className="text-[9px] text-zinc-600">{session.displayCode}</span>
      </div>
      <div className="px-3 pb-2 sm:px-4 sm:pb-3">
        {pending.length === 0 && allSettled.length === 0 ? (
          <p className="py-1 text-[10px] text-zinc-400">{t('game.no_positions')}</p>
        ) : (
          <>
            {pending.map((b) => (
              <div key={b.clientBetId} className="flex items-center gap-1 sm:gap-2 border-b border-[#1f2128] py-1.5 last:border-0">
                <span className="w-16 sm:w-20 text-[10px] font-black uppercase tracking-wider text-yellow-400">{b.betCode}</span>
                <span className="flex-1 text-right text-[10px] text-zinc-500">{b.stake.toLocaleString()}</span>
                <span className="text-[10px] text-zinc-600 sm:hidden">→{b.potentialPayout.toLocaleString()}</span>
                <span className="hidden sm:inline text-[10px] text-zinc-600">→ {b.potentialPayout.toLocaleString()} {t('common.points')}</span>
              </div>
            ))}
            {allSettled.map((b) => (
              <div key={b.clientBetId} className="flex items-center gap-1 sm:gap-2 border-b border-[#1f2128] py-1.5 last:border-0">
                <span className="w-16 sm:w-20 text-[10px] font-black uppercase tracking-wider text-yellow-400">{b.betCode}</span>
                <span className="flex-1 text-right text-[10px] text-zinc-500">{b.result === 'WIN' ? t('game.win') : b.result}</span>
                <span className={`text-[11px] font-extrabold tabular-nums ${b.result === "WIN" ? "text-emerald-400" : "text-red-400"}`}>
                  {b.result === "WIN" ? `+${(b.payout - b.stake).toLocaleString()}` : `-${b.stake.toLocaleString()}`}
                </span>
              </div>
            ))}
            {allSettled.length > 0 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">{t('game.net')}</span>
                <span className={`text-[12px] font-extrabold tabular-nums ${netPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {netPnl >= 0 ? "+" : ""}{netPnl.toLocaleString()}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RecentResultsInline({ recent }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="px-3 py-2 sm:px-4 sm:py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">{t('game.settled_rounds')}</p>
      </div>
      <div className="px-3 pb-2 sm:px-4 sm:pb-3">
        {recent.length === 0
          ? <p className="py-1 text-[10px] text-zinc-500">{t('game.no_settled')}</p>
          : recent.map((s) => (
            <div key={s.sessionCode} className="flex items-center gap-1 sm:gap-2 border-b border-[#1f2128] py-2 last:border-0">
              <span className="w-10 sm:w-14 font-mono text-[9px] text-zinc-500 shrink-0">{s.displayCode.slice(-4)}</span>
              <div className="flex items-center gap-0.5">
                {[s.digit1, s.digit2, s.digit3].map((d, i) => (
                  <span key={i} className="grid h-5 w-4 place-items-center rounded border border-[#1f2128] bg-[#13151c] font-mono text-[11px] font-black text-yellow-400">
                    {d ?? "?"}
                  </span>
                ))}
              </div>
              <span className="font-mono text-[11px] sm:text-[13px] font-black text-white">{s.resultTotal}</span>
              <span className={`ml-auto text-[8px] sm:text-[9px] font-extrabold uppercase ${s.bigSmall === "BIG" ? "text-emerald-400" : "text-red-400"}`}>{s.bigSmall === 'BIG' ? t('game.big') : t('game.small')}</span>
              <span className={`text-[8px] sm:text-[9px] font-extrabold uppercase ${s.oddEven === "ODD" ? "text-emerald-400" : "text-red-400"}`}>{s.oddEven === 'ODD' ? t('game.odd') : t('game.even')}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function BidHistoryInline({ bids }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="px-3 py-2 sm:px-4 sm:py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">{t('game.order_history')}</p>
      </div>
      <div className="px-3 pb-2 sm:px-4 sm:pb-3">
        {bids.length === 0
          ? <p className="py-1 text-[10px] text-zinc-400">{t('game.no_orders')}</p>
          : bids.map((b) => {
            const win = b.result === "WIN";
            const lose = b.result === "LOSE";
            return (
              <div key={b.clientBetId} className="flex items-center gap-1 sm:gap-2 border-b border-[#1f2128] py-1.5 last:border-0">
                <span className="w-14 sm:w-16 text-[10px] font-black uppercase tracking-wider text-yellow-400">{b.betCode}</span>
                <span className="hidden sm:inline font-mono text-[9px] text-zinc-600">{b.displayCode.slice(4)}</span>
                <span className="font-mono text-[8px] text-zinc-600 sm:hidden">{b.displayCode.slice(-6)}</span>
                <span className="flex-1 text-right text-[10px] text-zinc-500">{b.stake.toLocaleString()}</span>
                <span className={`w-14 sm:w-16 text-right text-[10px] font-extrabold tabular-nums ${win ? "text-emerald-400" : lose ? "text-red-400" : "text-zinc-400"}`}>
                  {b.status === "PENDING" ? `${b.potentialPayout.toLocaleString()}` : win ? `+${(b.payout - b.stake).toLocaleString()}` : `-${b.stake.toLocaleString()}`}
                </span>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

function Label({ children, className }) {
  return <p className={`text-[10px] font-bold uppercase tracking-wider text-zinc-400 ${className || ""}`}>{children}</p>;
}

function BetBtn({ label, active, disabled, onClick, color }) {
  const { t } = useI18n();
  const on = color === "emerald"
    ? "border-emerald-400 bg-emerald-400/15 text-emerald-300 shadow-[0_0_18px_-4px_rgba(52,211,153,0.6)]"
    : "border-red-400 bg-red-400/15 text-red-300 shadow-[0_0_18px_-4px_rgba(248,113,113,0.6)]";
  const off = color === "emerald"
    ? "border-[#1f2128] bg-[#13151c] text-zinc-400 hover:border-emerald-400/30 hover:bg-emerald-400/5 hover:text-emerald-400"
    : "border-[#1f2128] bg-[#13151c] text-zinc-400 hover:border-red-400/30 hover:bg-red-400/5 hover:text-red-400";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${t('game.select')} ${label}`}
      aria-pressed={active}
      className={`h-11 rounded-lg border text-sm font-black tracking-widest transition-all duration-150 active:scale-[0.97] disabled:opacity-30 ${active ? on : off}`}
    >
      {label}
    </button>
  );
}

function MRow({ l, v, bold, accent }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{l}</span>
      <span className={`text-[11px] font-bold ${accent ? "text-yellow-400" : bold ? "text-white" : "text-zinc-300"}`}>{v}</span>
    </div>
  );
}
