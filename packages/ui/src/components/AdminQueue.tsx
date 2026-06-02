import { useState } from 'react';

interface Tx {
  id: string;
  user: string;
  amount: number;
  method: string;
  time: string;
  status: string;
  turnoverPct?: number;
  balance?: number;
}

interface AdminQueueProps {
  title: string;
  items: Tx[];
  type: 'deposit' | 'withdrawal';
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
}

function TxRow({ tx, type, onApprove, onReject }: { tx: Tx; type: string; onApprove: (id: string) => Promise<void>; onReject: (id: string) => Promise<void> }) {
  const [loading, setLoading] = useState<string | null>(null);

  const handle = async (action: 'approve' | 'reject', id: string) => {
    setLoading(action);
    try {
      if (action === 'approve') await onApprove(id);
      else await onReject(id);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1f2128] last:border-0 hover:bg-[#13151c] transition-colors">
      {/* User info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{tx.user}</p>
        <p className="text-[10px] text-zinc-500 font-mono">{tx.time}</p>
      </div>

      {/* Amount */}
      <div className="text-right shrink-0">
        <p className={`text-sm font-black font-mono ${type === 'deposit' ? 'text-emerald-400' : 'text-red-400'}`}>
          {type === 'deposit' ? '+' : '-'}{tx.amount.toLocaleString()} P
        </p>
        {type === 'withdrawal' && tx.turnoverPct !== undefined && (
          <div className="flex items-center gap-1 text-[10px] text-zinc-500">
            <span>TO:</span>
            <div className="h-1.5 w-16 rounded-full bg-[#1f2128] overflow-hidden">
              <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${Math.min(100, tx.turnoverPct)}%` }} />
            </div>
            <span>{tx.turnoverPct}%</span>
          </div>
        )}
        {type === 'withdrawal' && tx.balance !== undefined && (
          <p className="text-[10px] text-zinc-600">Balance: {tx.balance.toLocaleString()} P</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 shrink-0">
        <button
          onClick={() => handle('approve', tx.id)}
          disabled={loading !== null}
          className="h-8 px-3 rounded-lg text-[11px] font-bold bg-emerald-500 text-white hover:bg-emerald-400 disabled:opacity-50 transition-colors"
        >
          {loading === 'approve' ? (
            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : 'Approve'}
        </button>
        <button
          onClick={() => handle('reject', tx.id)}
          disabled={loading !== null}
          className="h-8 px-3 rounded-lg text-[11px] font-bold bg-red-500 text-white hover:bg-red-400 disabled:opacity-50 transition-colors"
        >
          {loading === 'reject' ? (
            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : 'Reject'}
        </button>
      </div>
    </div>
  );
}

export function AdminQueue({ title, items, type, onApprove, onReject }: AdminQueueProps) {
  const pending = items.filter(t => t.status === 'PENDING');
  const done = items.filter(t => t.status !== 'PENDING');

  return (
    <div className="bg-[#0c0e14] border border-[#1f2128] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f2128]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {pending.length > 0 && (
            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-yellow-400 text-black text-[10px] font-bold flex items-center justify-center">
              {pending.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-zinc-500">{items.length} total</span>
      </div>

      {/* Pending queue */}
      {pending.length > 0 ? (
        <div>
          {pending.map(tx => (
            <TxRow key={tx.id} tx={tx} type={type} onApprove={onApprove} onReject={onReject} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-zinc-500">No pending {type === 'deposit' ? 'deposits' : 'withdrawals'}</p>
          <p className="text-[10px] text-zinc-600 mt-1">Queue is empty</p>
        </div>
      )}

      {/* Completed (collapsible) */}
      {done.length > 0 && (
        <details className="border-t border-[#1f2128]">
          <summary className="px-4 py-2 text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300 font-semibold">
            Completed ({done.length})
          </summary>
          <div className="opacity-50">
            {done.map(tx => (
              <TxRow key={tx.id} tx={tx} type={type} onApprove={onApprove} onReject={onReject} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
