interface WalletBalanceProps {
  available: number;
  withdrawable: number;
  turnoverRequired: number;
  turnoverAchieved: number;
  currency?: string;
}

function ProgressBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-zinc-500">
        <span>Turnover Progress</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#1f2128]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-emerald-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-600">
        <span className="font-mono">{current.toLocaleString()} / {max.toLocaleString()}</span>
        {max > current && (
          <span className="text-yellow-400">{((max - current)).toLocaleString()} remaining</span>
        )}
        {max <= current && (
          <span className="text-emerald-400">✅ Unlocked</span>
        )}
      </div>
    </div>
  );
}

export function WalletBalance({
  available,
  withdrawable,
  turnoverRequired,
  turnoverAchieved,
  currency = 'P',
}: WalletBalanceProps) {
  return (
    <div className="space-y-4">
      {/* Available */}
      <div className="bg-[#0c0e14] border border-[#1f2128] rounded-xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Available Balance</p>
        <p className="mt-1 text-4xl font-black text-white font-mono tabular-nums">
          {available.toLocaleString()}
          <span className="ml-1.5 text-lg font-bold text-yellow-400">{currency}</span>
        </p>
      </div>

      {/* Withdrawable */}
      <div className="bg-[#0c0e14] border border-[#1f2128] rounded-xl p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Withdrawable</p>
          <span className={`text-xs font-bold ${withdrawable > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
            {withdrawable > 0 ? '✅ Ready' : '🔒 Locked'}
          </span>
        </div>
        <p className={`mt-1 text-2xl font-black font-mono tabular-nums ${withdrawable > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
          {withdrawable.toLocaleString()} {currency}
        </p>
        {withdrawable < available && (
          <div className="mt-3">
            <ProgressBar current={turnoverAchieved} max={turnoverRequired} />
          </div>
        )}
      </div>
    </div>
  );
}
