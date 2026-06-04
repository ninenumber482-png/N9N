import { useEffect, useState, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../store/useStore";
import { fetchUserTransactions } from "../store/wallet";
import { listBids, refreshKingData } from "../store/king";
import { Icon } from "../components/icons";
import SectionHead from "../components/ui/SectionHead";
import PageShell from "../components/ui/PageShell";
import { useI18n } from '../i18n';
import { wibDateTime } from '../utils/wib';

function useWalletBalances() {
  const totalBalance = useStore((s) => s.totalBalance);
  const availableBalance = useStore((s) => s.availableBalance);
  const lockedBalance = useStore((s) => s.lockedBalance);
  const referralBonus = useStore((s) => s.referralBonus);

  return useMemo(() => {
    const main = availableBalance ?? 0;
    const bonus = referralBonus ?? 0;
    const locked = lockedBalance ?? 0;
    const total = totalBalance ?? (main + bonus + locked);
    return { main, bonus, locked, total };
  }, [availableBalance, lockedBalance, referralBonus, totalBalance]);
}

export default function WalletPage() {
  const auth = useStore((s) => s.auth);
  const _rtTick = useStore((s) => s._rtTick);
  const { clientUuid } = useParams();
  const p = (path) => `/c/${clientUuid}${path}`;
  const { t } = useI18n();
  const [, setRefreshCount] = useState(0);
  const balances = useWalletBalances();
  const [txs, setTxs] = useState([]);
  const [txsLoading, setTxsLoading] = useState(true);
  const [txsRefreshing, setTxsRefreshing] = useState(false);
  const [txsError, setTxsError] = useState(null);
  const [kingLoading, setKingLoading] = useState(true);
  const [kingRefreshing, setKingRefreshing] = useState(false);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (!auth?.id) return;
    const isInitial = isInitialLoadRef.current;
    if (isInitial) setTxsLoading(true);
    setTxsRefreshing(true);
    setTxsError(null);
    fetchUserTransactions(auth.id).then(setTxs).catch(e => {
      setTxsError('Failed to load transactions');
    }).finally(() => {
      setTxsLoading(false);
      setTxsRefreshing(false);
      isInitialLoadRef.current = false;
    });
  }, [auth?.id, _rtTick]);

  /* refresh king data on mount + realtime tick */
  useEffect(() => {
    if (!auth?.id) return;
    setKingLoading(true);
    setKingRefreshing(true);
    refreshKingData(auth.id).then(() => setRefreshCount(c => c + 1)).catch(() => {}).finally(() => {
      setKingLoading(false);
      setKingRefreshing(false);
    });
  }, [auth?.id, _rtTick]);

  const pendingDeposit = txs
    .filter((t) => t.type === "DEPOSIT" && t.status === "PENDING")
    .reduce((s, t) => s + t.amount, 0);
  const pendingWithdraw = txs
    .filter((t) => (t.type === "WITHDRAW" || t.type === "WITHDRAWAL") && t.status === "PENDING")
    .reduce((s, t) => s + t.amount, 0);

  const settledBids = listBids().filter(b => b.result);
  const totalStake = settledBids.reduce((s, b) => s + b.stake, 0);
  const totalPayout = settledBids.reduce((s, b) => s + (b.payout || 0), 0);
  const pnl = totalPayout - totalStake;
  const winCount = settledBids.filter(b => b.result === "WIN").length;
  const loseCount = settledBids.filter(b => b.result === "LOSE").length;
  const lastBid = settledBids.length > 0 ? settledBids.reduce((a, b) => (a.sessionCode > b.sessionCode ? a : b)) : null;
  const lastPnl = lastBid ? lastBid.payout - lastBid.stake : 0;

  const walletTxs = txs.filter(t => t.type === "DEPOSIT" || t.type === "WITHDRAW" || t.type === "WITHDRAWAL");

  const WALLETS = [
    {
      name: t('wallet.saldo'),
      amount: balances.main.toLocaleString(),
      sub: `${t('wallet.pending_deposit', { amount: pendingDeposit.toLocaleString() })} · ${t('wallet.pending_withdraw', { amount: pendingWithdraw.toLocaleString() })}`,
      tag: t('common.active'),
      pnl,
      winCount,
      loseCount,
      totalGames: settledBids.length,
    },
  ];

  const METHODS = [
    {
      I: Icon.Coin,
      t: t('wallet.usdt'),
      d: t('wallet.usdt_desc'),
      to: p('/deposit'),
    },
    {
      I: Icon.Bank,
      t: t('wallet.bank'),
      d: t('wallet.bank_desc'),
      to: p('/deposit'),
    },
    {
      I: Icon.Phone,
      t: t('wallet.ewallet'),
      d: t('wallet.ewallet_desc'),
      to: p('/deposit'),
    },
  ];

  const statusColor = (status) => {
    if (status === "COMPLETED" || status === "APPROVED") return "text-emerald-400";
    if (status === "FAILED" || status === "REJECTED") return "text-red-400";
    return "text-amber-400";
  };

  const statusLabel = (status) => {
    if (status === "COMPLETED" || status === "APPROVED") return "Selesai";
    if (status === "FAILED" || status === "REJECTED") return "Ditolak";
    return "Menunggu Konfirmasi";
  };

  return (
    <PageShell
      title={t('wallet.title')}
      subtitle={t('wallet.subtitle')}
      back={{ to: p('/dashboard'), label: t('common.back') }}
      actions={
        <div className="hidden sm:flex gap-1.5">
          <Link
            to={p('/deposit')}
            className="grid h-9 place-items-center rounded bg-yellow-400 px-3.5 text-[12px] font-extrabold text-black hover:bg-yellow-300"
          >
            {t('wallet.deposit')}
          </Link>
          <Link
            to={p('/withdraw')}
            className="grid h-9 place-items-center rounded border border-[#1f2128] bg-[#13151c] px-3.5 text-[12px] font-bold text-white hover:border-yellow-400/30"
          >
            {t('wallet.withdraw')}
          </Link>
          <button onClick={() => {}} className="grid h-9 place-items-center rounded px-3 text-[12px] font-bold text-zinc-400 hover:text-yellow-400" title={t('wallet.coming_soon')}>
            {t('wallet.transfer')}
          </button>
        </div>
      }
    >
      {/* WALLETS */}
      <section>
        <SectionHead>{t('wallet.my_wallets')}</SectionHead>
        <div className="space-y-2 sm:space-y-3">
          {WALLETS.map((w) => (
            <article
              key={w.name}
              className="w-full rounded-xl border border-[#1f2128] bg-[#0c0e14] p-3 flex items-center justify-between gap-3 sm:gap-5 sm:p-4"
            >
              <div className="flex flex-1 items-center gap-2 sm:gap-4 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">
                      {w.name}
                    </p>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                      {w.tag}
                    </span>
                  </div>
                  <p className="text-[18px] sm:text-[22px] lg:text-3xl font-black leading-none tabular-nums text-white mt-0.5 sm:mt-0">
                    {w.amount}
                    <span className="ml-1 text-xs sm:text-sm font-bold text-yellow-400">
                      {t('common.points')}
                    </span>
                  </p>
                  <p className="text-[9px] sm:text-[10px] text-zinc-500 truncate">{w.sub}</p>
                </div>
              </div>

              {kingLoading ? (
                <div className="grid h-16 w-40 shrink-0 place-items-center rounded-lg border border-[#1f2128] bg-[#13151c]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
                </div>
              ) : w.totalGames > 0 ? (
                <div className="grid grid-cols-3 divide-x divide-[#1f2128] rounded-lg border border-[#1f2128] bg-[#13151c] shrink-0">
                  <div className="px-2 py-1 text-center sm:px-4 sm:py-2">
                    <p className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                      {t('wallet.games')}
                    </p>
                    <p className="text-[10px] sm:text-sm font-extrabold tabular-nums text-white">
                      {w.totalGames}
                    </p>
                  </div>
                  <div className="px-2 py-1 text-center sm:px-4 sm:py-2">
                    <p className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                      {t('wallet.wl')}
                    </p>
                    <p className="text-[10px] sm:text-sm font-extrabold tabular-nums">
                      <span className="text-emerald-400">{w.winCount}</span>
                      <span className="text-zinc-500">/</span>
                      <span className="text-red-400">{w.loseCount}</span>
                    </p>
                  </div>
                  <div className="px-2 py-1 text-center sm:px-4 sm:py-2">
                    <p className="text-[7px] sm:text-[8px] font-bold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                      {t('wallet.pnl')}
                    </p>
                    <p className={`text-[10px] sm:text-sm font-extrabold tabular-nums ${w.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {w.pnl >= 0 ? "+" : ""}{w.pnl.toLocaleString()} {t('common.points')}
                    </p>
                  </div>
                </div>
              ) : null}

            </article>
          ))}
        </div>
      </section>

      {/* MOBILE CTA */}
      <div className="flex gap-2 lg:hidden">
        <Link
          to={p('/deposit')}
          className="flex-1 grid h-10 place-items-center rounded bg-yellow-400 text-sm font-extrabold text-black"
        >
          {t('wallet.deposit')}
        </Link>
        <Link
          to={p('/withdraw')}
          className="flex-1 grid h-10 place-items-center rounded border border-[#1f2128] bg-[#13151c] text-sm font-bold text-white"
        >
          {t('wallet.withdraw')}
        </Link>
      </div>

      {/* DEPOSIT METHODS */}
      <section>
        <SectionHead>{t('wallet.deposit_methods')}</SectionHead>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 lg:gap-2">
          {METHODS.map((m) => (
            <Link
              key={m.t}
              to={m.to}
              className="group flex items-center gap-2.5 rounded-xl border border-[#1f2128] bg-[#0c0e14] p-2.5 text-left transition hover:border-yellow-400/30 hover:shadow-lg active:scale-[0.99] lg:p-3"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-yellow-400">
                <m.I size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-white lg:text-[13px]">
                  {m.t}
                </p>
                <p className="text-[10px] text-zinc-500">{m.d}</p>
              </div>
              <span className="text-zinc-500 opacity-60 group-hover:opacity-100">
                <Icon.Chevron size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ACTIVITY */}
      <section>
        <SectionHead>
          <div className="flex items-center gap-2">
            <span>Transaction History</span>
            {txsRefreshing && !txsLoading && (
              <span className="inline-block animate-spin text-zinc-500"><Icon.Refresh size={11} /></span>
            )}
          </div>
        </SectionHead>
        <div className="divide-y divide-[#1f2128] rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          {lastBid && (
            <div className="flex items-center gap-2.5 px-2.5 py-2 lg:px-3.5">
              <span className="w-16 text-[10px] font-black uppercase tracking-widest text-yellow-400">
                {t('wallet.pnl')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-white lg:text-[13px]">
                  #{lastBid.sessionCode?.slice(-6)} · {lastBid.betCode}
                </p>
                <p className="text-[10px] text-zinc-500">{t('wallet.last_game')}</p>
              </div>
              <p className={`text-right text-[12px] font-extrabold tabular-nums lg:text-sm ${lastPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {lastPnl >= 0 ? "+" : ""}{lastPnl.toLocaleString()} {t('common.points')}
              </p>
            </div>
          )}
          {walletTxs.slice(0, 10).map((a) => {
            const isDone = a.status === 'COMPLETED' || a.status === 'APPROVED'
            const isFailed = a.status === 'FAILED' || a.status === 'REJECTED'
            const amtColor = a.type === 'DEPOSIT'
              ? (isDone ? 'text-emerald-400' : isFailed ? 'text-red-400' : 'text-amber-400')
              : 'text-red-400'
            return (
              <div
                key={a.id}
                className="flex items-center gap-2.5 px-2.5 py-2 lg:px-3.5"
              >
                <span
                  className={`w-16 shrink-0 text-[10px] font-black uppercase tracking-widest ${amtColor}`}
                >
                  {a.type === "DEPOSIT" ? t('wallet.dp') : t('wallet.wd')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[12px] font-semibold text-white lg:text-[13px]">
                      {a.method || '—'} · {(a.id || '').slice(-6)}
                    </p>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${statusColor(a.status) === 'text-emerald-400' ? 'bg-emerald-400/10 text-emerald-400' : statusColor(a.status) === 'text-red-400' ? 'bg-red-400/10 text-red-400' : 'bg-amber-400/10 text-amber-400'}`}>
                      {statusLabel(a.status)}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    {wibDateTime(a.requestedAt)}
                  </p>
                </div>
                <p className={`w-20 shrink-0 text-right text-[12px] font-extrabold tabular-nums lg:text-sm ${amtColor}`}>
                  {a.type === "DEPOSIT" ? "+" : "-"}
                  {(a.amount || 0).toLocaleString()} {t('common.points')}
                </p>
              </div>
            )
          })}
          {txsLoading ? (
            <div className="px-3 py-6 text-center">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
            </div>
          ) : txsError ? (
            <div className="px-3 py-4 text-center text-[11px] text-red-400">
              {txsError}
            </div>
          ) : walletTxs.length === 0 && !lastBid && (
            <div className="px-3 py-4 text-center text-[11px] text-zinc-500">
              {t('wallet.no_transactions')}
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
