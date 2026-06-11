import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useStore } from "../store/useStore";
import { fetchUserTransactions, fetchTurnoverSummary } from "../store/wallet";
import { listBids, getSettled, refreshKingData } from "../store/king";
import Spinner from "../components/ui/Spinner";
import Toast from "../components/ui/Toast";
import PageShell from "../components/ui/PageShell";
import useAlive from "../hooks/useAlive";
import { useI18n } from '../i18n';
import { wibDateTime } from '../utils/wib';
import { formatIDR } from '../utils/format';
import { useParams, useSearchParams } from 'react-router-dom';

export default function HistoryPage() {
  const auth = useStore((s) => s.auth);
  const _rtTick = useStore((s) => s._rtTick);
  const { clientUuid } = useParams();
  const p = (path) => `/c/${clientUuid}${path}`;
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  // Honor ?type=Deposit|Withdraw|Bet|Result|All on deep link (used by
  // DepositPage "See All" → auto-filter to deposits).
  const initialType = (() => {
    const q = searchParams.get('type');
    return ['All', 'Deposit', 'Withdraw', 'Bet', 'Result'].includes(q) ? q : 'All';
  })();
  const [type, setType] = useState(initialType);
  const [range, setRange] = useState("30d");
  const [txs, setTxs] = useState([]);
  const [turnoverData, setTurnoverData] = useState({ required: 0, achieved: 0, isUnlocked: true });
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const [kingReady, setKingReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState(null);
  const aliveRef = useAlive();
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const TYPES = [
    { key: "All", label: t('history.all') },
    { key: "Deposit", label: t('history.deposit') },
    { key: "Withdraw", label: t('history.withdraw') },
    { key: "Bet", label: t('history.bet') },
    { key: "Result", label: t('history.result') },
  ];
  const RANGES = [
    { key: "30d", label: t('history.d30') },
    { key: "7d", label: t('history.d7') },
    { key: "24h", label: t('history.h24') },
    { key: "All Time", label: t('history.all_time') },
  ];

  const rangeMs = useCallback((r) => {
    if (r === "24h") return 86400000;
    if (r === "7d") return 604800000;
    if (r === "30d") return 2592000000;
    return Infinity;
  }, []);

  useEffect(() => {
    if (!auth?.id) return;
    const isInitial = isInitialLoadRef.current;
    if (isInitial) {
      setLoading(true);
      setKingReady(false);
    } else {
      setRefreshing(true);
    }
    Promise.all([
      fetchUserTransactions(auth.id, 100),
      fetchTurnoverSummary(auth.id),
      refreshKingData(auth.id),
    ]).then(([txData, tvData]) => {
      if (!aliveRef.current) return;
      setTxs(txData || []);
      setTurnoverData(tvData || { required: 0, achieved: 0, isUnlocked: true });
      setKingReady(true);
      setLoading(false);
      setRefreshing(false);
      isInitialLoadRef.current = false;
    }).catch(() => {
      if (aliveRef.current) {
        setLoading(false);
        setRefreshing(false);
        setToast({ type: 'err', text: t('auth.history_load_failed') });
        isInitialLoadRef.current = false;
      }
    });
    // Re-fetch when realtime tick fires (new bet/tx from anywhere)
  }, [auth?.id, _rtTick, t, setToast, aliveRef]);

  const bids = auth && kingReady ? listBids() : [];

  const bidRows = bids.map((b) => {
    const won = b.result === "WIN";
    const profit = won && b.payout != null ? b.payout - b.stake : 0;
    const displayAmount = won
      ? `+${profit.toLocaleString()}`
      : b.result === "LOSE" ? `-${(b.stake || 0).toLocaleString()}`
      : `-${(b.stake || 0).toLocaleString()}`;
    return {
      id: b.clientBetId,
      type: "Bet",
      desc: `${b.betCode || '—'} · ${b.displayCode || b.sessionCode || '—'}`,
      date: wibDateTime(b.placedAt),
      status: b.status,
      result: b.result,
      won,
      amount: displayAmount,
      ts: new Date(b.placedAt).getTime(),
    };
  });

  const sessionBetMap = {};
  bids.forEach((b) => {
    if (!sessionBetMap[b.sessionCode]) sessionBetMap[b.sessionCode] = { bets: [], pnl: 0 };
    sessionBetMap[b.sessionCode].bets.push(b);
    if (b.result === "WIN") sessionBetMap[b.sessionCode].pnl += (b.payout ?? 0) - (b.stake ?? 0);
    else if (b.result === "LOSE") sessionBetMap[b.sessionCode].pnl -= (b.stake ?? 0);
  });

  const resultRows = Object.entries(sessionBetMap)
    .map(([sessionCode, { bets: sessionBids, pnl }]) => {
      const r = getSettled(sessionCode);
      if (!r) return null;
      const betCount = sessionBids.length;
      const pnlStr = pnl > 0 ? `+${pnl.toLocaleString()}` : pnl < 0 ? `${pnl.toLocaleString()}` : '0';
      return {
        id: `res-${sessionCode}`,
        type: "Result",
        desc: `${r.displayCode} · ${r.digit1}${r.digit2}${r.digit3} · ${r.resultTotal} ${r.bigSmall} ${r.oddEven} · ${betCount} ${betCount === 1 ? 'bet' : 'bets'}`,
        date: wibDateTime(r.settledAt),
        status: 'SETTLED',
        result: pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSE' : 'DRAW',
        won: pnl > 0,
        amount: pnlStr,
        ts: r.settledAt ? new Date(r.settledAt).getTime() : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts);

  const txRows = txs.map((tx) => {
    const txType =
      tx.type === "DEPOSIT" ? "Deposit"
      : tx.type === "WITHDRAW" ? "Withdraw"
      : tx.type;
    return {
      id: tx.id,
      type: txType,
      desc: `${tx.method || '—'} · ${tx.referenceCode || String(tx.id || '').slice(-6)}`,
      date: wibDateTime(tx.requestedAt),
      status: tx.status,
      amount: `${txType === "Deposit" ? '+' : '-'}${(tx.amount || 0).toLocaleString('id-ID')} P`,
      amountIdr: formatIDR(tx.amount || 0),
      ts: new Date(tx.requestedAt).getTime(),
      proof: tx.proof || null,
    };
  });

  const rows = useMemo(() => {
    const ms = rangeMs(range);
    let r = [...txRows, ...bidRows, ...resultRows].sort((a, b) => b.ts - a.ts);
    if (ms < Infinity) {
      // For 24h range, `now` ticks every second so the cutoff moves with
      // the wall clock — include it in deps so the filter re-runs. For
      // 7d/30d/All Time, the cutoff barely changes (sub-second precision
      // is invisible) so we compute it once at memo time and skip the
      // per-second recompute, saving CPU on the long lists.
      const cutoff = now - ms;
      r = r.filter((row) => row.ts >= cutoff);
    }
    if (type !== "All") r = r.filter((row) => row.type === type);
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txRows, bidRows, resultRows, range, type, range === "24h" ? now : null]);

  const statusColor = (row) => {
    if (row.won) return "text-emerald-400";
    if (row.result === "LOSE" || row.status === "REJECTED" || row.status === "Lost") return "text-red-400";
    if (row.status === "APPROVED" || row.status === "Completed" || row.status === "Credited") return "text-emerald-400";
    if (row.status === "PENDING") return "text-yellow-400";
    return "text-zinc-500";
  };

  const statusLabel = (row) => {
    if (row.won) return "WIN";
    if (row.result === "LOSE") return "LS";
    if (row.status === "APPROVED" || row.status === "Completed" || row.status === "Credited") return "AP";
    if (row.status === "PENDING") return "PD";
    if (row.status === "REJECTED" || row.status === "Lost") return "RJ";
    return row.status?.slice(0, 3) || "—";
  };

  return (
    <PageShell
      title={t('history.title')}
      subtitle={t('history.subtitle')}
      back={{ to: p('/dashboard'), label: t('common.back') }}
    >
      {/* Turnover Summary */}
      {!turnoverData.isUnlocked && (
        <div className="rounded border border-[#1f2128] bg-[#13151c] p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {t('history.deposit_turnover')}
          </p>
          <div className="mt-2 flex items-center justify-between rounded border border-[#1f2128] bg-[#0c0e14] px-2.5 py-1.5">
            <span className="text-[10px] text-zinc-400">{t('turnover.required')}</span>
            <span className="text-[10px] font-bold text-yellow-400">
              {(turnoverData.achieved || 0).toLocaleString()} / {(turnoverData.required || 0).toLocaleString()} {t('common.points')}
            </span>
          </div>
        </div>
      )}

      <section className="space-y-1.5">
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 lg:mx-0 lg:flex-wrap lg:px-0 [&::-webkit-scrollbar]:hidden">
          {TYPES.map((opt) => (
            <Chip key={opt.key} active={type === opt.key} onClick={() => setType(opt.key)}>
              {opt.label}
            </Chip>
          ))}
          <span className="hidden lg:inline-block lg:w-2" />
          {RANGES.map((opt) => (
            <Chip key={opt.key} active={range === opt.key} onClick={() => setRange(opt.key)}>
              {opt.label}
            </Chip>
          ))}
        </div>
      </section>

      <div className="divide-y divide-[#1f2128] rounded border border-[#1f2128] bg-[#0c0e14]">
        {loading && (
          <Spinner size="sm" />
        )}
        {!loading && rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 px-2.5 py-2.5 lg:px-3.5">
            <span className={`w-14 shrink-0 text-[9px] font-black uppercase tracking-widest sm:w-16 sm:text-[10px] ${r.type === "Deposit" ? "text-emerald-400" : r.type === "Withdraw" ? "text-red-400" : "text-yellow-400"}`}>
              {r.type === "Bet" ? t('history.bet') : r.type === "Deposit" ? t('history.deposit') : r.type === "Withdraw" ? t('history.withdraw') : r.type}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-white sm:text-[12px]">{r.desc}</p>
              <p className="font-mono text-[8px] text-zinc-500 sm:text-[9px]">
                {r.date}
              </p>
              {r.proof && (
                <p className="text-[8px] text-yellow-400/70">{t('history.proof_uploaded')}</p>
              )}
            </div>
            <span className={`w-20 shrink-0 text-right text-[11px] font-extrabold tabular-nums sm:w-28 sm:text-sm ${String(r.amount || '').startsWith("+") ? "text-emerald-400" : "text-red-400"}`}>
              <span>{r.amount || ''}</span>
              {r.amountIdr && <span className="block text-[9px] text-yellow-400/80 font-medium sm:text-[10px]">{r.amountIdr}</span>}
            </span>
            <span className={`w-12 shrink-0 text-right text-[9px] font-bold uppercase tracking-widest sm:w-20 sm:text-[10px] ${statusColor(r)}`}>
              <span className="sm:hidden">{statusLabel(r)}</span>
              <span className="hidden sm:inline">{r.result || r.status}</span>
            </span>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-zinc-500">{t('history.no_results')}</p>
          </div>
        )}
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </PageShell>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded border px-2.5 py-1 text-[11px] font-bold transition active:scale-95 ${active ? "border-yellow-400 bg-[#13151c] text-yellow-400" : "border-[#1f2128] bg-[#13151c] text-zinc-400 hover:text-white"}`}
    >
      {children}
    </button>
  );
}
