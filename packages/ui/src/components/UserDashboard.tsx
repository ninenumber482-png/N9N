import type { ReactNode } from 'react';

interface ActiveBet {
  session: string;
  selection: string;
  stake: number;
  potentialPayout: number;
  status: string;
}

interface RecentTx {
  id: string;
  type: string;
  amount: number;
  status: string;
  time: string;
}

interface UserDashboardProps {
  balance: number;
  depositLocked: boolean;
  depositLockRemaining?: number;
  activeBets: ActiveBet[];
  recentTransactions: RecentTx[];
  actions: {
    onDeposit: () => void;
    onWithdraw: () => void;
    onPlay: () => void;
  };
}

function QuickAction({ label, sub, color, onClick }: { label: string; sub: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border p-4 transition-all active:scale-95 ${color}`}
    >
      <span className="text-sm font-bold">{label}</span>
      <span className="text-[10px] opacity-70">{sub}</span>
    </button>
  );
}

export function UserDashboard({ balance, depositLocked, activeBets, recentTransactions, actions }: UserDashboardProps) {
  return (
    <div className="space-y-4 p-4 max-w-lg mx-auto">
      {/* Balance Hero */}
      <div className="bg-gradient-to-br from-yellow-400/10 via-[#0c0e14] to-[#0c0e14] border border-yellow-400/20 rounded-2xl p-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Available Balance</p>
        <p className="mt-2 text-5xl font-black text-white font-mono tabular-nums">
          {balance.toLocaleString()}
          <span className="ml-1.5 text-xl font-bold text-yellow-400">P</span>
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <QuickAction
          label="Deposit"
          sub={depositLocked ? 'Locked' : 'Add funds'}
          color="border-emerald-400/30 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20"
          onClick={actions.onDeposit}
        />
        <QuickAction
          label="Withdraw"
          sub="Request payout"
          color="border-red-400/30 bg-red-400/10 text-red-400 hover:bg-red-400/20"
          onClick={actions.onWithdraw}
        />
        <QuickAction
          label="3D King"
          sub={activeBets.length > 0 ? `${activeBets.length} active` : 'Play now'}
          color="border-yellow-400/30 bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20"
          onClick={actions.onPlay}
        />
      </div>

      {/* Active Bets */}
      <div className="bg-[#0c0e14] border border-[#1f2128] rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f2128]">
          <p className="text-xs font-bold text-white">Active Bets</p>
          <span className="text-[10px] text-zinc-500">{activeBets.length > 0 ? `${activeBets.length} open` : 'None'}</span>
        </div>
        {activeBets.length > 0 ? (
          <div className="divide-y divide-[#1f2128]">
            {activeBets.slice(0, 3).map((b, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-xs font-semibold text-yellow-400 font-mono">{b.selection}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">{b.session}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-white">{b.stake.toLocaleString()} P</p>
                  <p className="text-[10px] text-emerald-400">→ {b.potentialPayout.toLocaleString()} P</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-zinc-500">No active bets</p>
            <p className="text-[10px] text-zinc-600 mt-1">Place your first bet in 3D King</p>
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="bg-[#0c0e14] border border-[#1f2128] rounded-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f2128]">
          <p className="text-xs font-bold text-white">Recent</p>
          <span className="text-[10px] text-zinc-500">Transactions</span>
        </div>
        {recentTransactions.length > 0 ? (
          <div className="divide-y divide-[#1f2128]">
            {recentTransactions.slice(0, 4).map(tx => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    tx.status === 'COMPLETED' || tx.status === 'APPROVED' ? 'bg-emerald-400' :
                    tx.status === 'REJECTED' || tx.status === 'FAILED' ? 'bg-red-400' : 'bg-yellow-400'
                  }`} />
                  <div>
                    <p className="text-xs text-zinc-300">{tx.type === 'DEPOSIT' ? 'Deposit' : tx.type === 'WITHDRAWAL' ? 'Withdraw' : tx.type}</p>
                    <p className="text-[10px] text-zinc-600 font-mono">{tx.time}</p>
                  </div>
                </div>
                <p className={`text-xs font-bold font-mono ${
                  tx.type === 'DEPOSIT' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {tx.type === 'DEPOSIT' ? '+' : '-'}{tx.amount.toLocaleString()} P
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-4 text-center">
            <p className="text-xs text-zinc-500">No transactions yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
