interface EngineStatus {
  status: 'RUNNING' | 'STALLED' | 'NO_RESULTS';
  lastSettlement: string;
  lastWatchdog: string;
  resultAgeSec: number;
}

interface AdminOverviewProps {
  engine: EngineStatus;
  pendingDeposits: number;
  pendingWithdrawals: number;
  todayPnl: number;
  failedRpcCount: number;
  stats: {
    totalUsers: number;
    totalBets: number;
    totalTurnover: number;
  };
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    RUNNING: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30',
    STALLED: 'bg-red-400/10 text-red-400 border-red-400/30 animate-pulse',
    NO_RESULTS: 'bg-zinc-400/10 text-zinc-400 border-zinc-400/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${colors[status] || colors.NO_RESULTS}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'RUNNING' ? 'bg-emerald-400' : status === 'STALLED' ? 'bg-red-400' : 'bg-zinc-400'}`} />
      {status}
    </span>
  );
}

export function AdminOverview({ engine, pendingDeposits, pendingWithdrawals, todayPnl, failedRpcCount, stats }: AdminOverviewProps) {
  return (
    <div className="space-y-4">
      {/* Engine + Key Metrics bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0c0e14] border border-[#1f2128] rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Engine</p>
          <div className="mt-1.5"><StatusBadge status={engine.status} /></div>
          {engine.status === 'STALLED' && (
            <p className="mt-1 text-[10px] text-red-400 font-mono">{engine.resultAgeSec}s since last result</p>
          )}
        </div>

        <div className="bg-[#0c0e14] border border-[#1f2128] rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Pending Deposits</p>
          <p className={`mt-1.5 text-2xl font-black font-mono tabular-nums ${pendingDeposits > 0 ? 'text-yellow-400' : 'text-zinc-500'}`}>
            {pendingDeposits}
          </p>
        </div>

        <div className="bg-[#0c0e14] border border-[#1f2128] rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Pending WD</p>
          <p className={`mt-1.5 text-2xl font-black font-mono tabular-nums ${pendingWithdrawals > 0 ? 'text-red-400' : 'text-zinc-500'}`}>
            {pendingWithdrawals}
          </p>
        </div>

        <div className="bg-[#0c0e14] border border-[#1f2128] rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Today P&L</p>
          <p className={`mt-1.5 text-2xl font-black font-mono tabular-nums ${todayPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {todayPnl >= 0 ? '+' : ''}{todayPnl.toLocaleString()} P
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#0c0e14] border border-[#1f2128] rounded-lg px-3 py-2.5">
          <p className="text-[9px] text-zinc-500">Users</p>
          <p className="text-sm font-bold text-white font-mono">{stats.totalUsers}</p>
        </div>
        <div className="bg-[#0c0e14] border border-[#1f2128] rounded-lg px-3 py-2.5">
          <p className="text-[9px] text-zinc-500">Bets</p>
          <p className="text-sm font-bold text-white font-mono">{stats.totalBets}</p>
        </div>
        <div className="bg-[#0c0e14] border border-[#1f2128] rounded-lg px-3 py-2.5">
          <p className="text-[9px] text-zinc-500">Turnover</p>
          <p className="text-sm font-bold text-white font-mono">{stats.totalTurnover.toLocaleString()} P</p>
        </div>
        {failedRpcCount > 0 && (
          <div className="col-span-3 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">
            <p className="text-[10px] font-bold text-red-400">
              ⚠ {failedRpcCount} failed RPC calls detected — check ops_metrics
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
