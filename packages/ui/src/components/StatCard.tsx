import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: ReactNode;
  accent?: 'yellow' | 'emerald' | 'red' | 'zinc';
}

const accentMap = {
  yellow: 'border-l-yellow-400',
  emerald: 'border-l-emerald-400',
  red: 'border-l-red-400',
  zinc: 'border-l-zinc-500',
};

export function StatCard({ label, value, sub, trend, icon, accent = 'zinc' }: StatCardProps) {
  return (
    <div className={`bg-[#0c0e14] border border-[#1f2128] rounded-xl p-4 border-l-4 ${accentMap[accent]}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
        {icon && <span className="text-zinc-400">{icon}</span>}
      </div>
      <p className="mt-1.5 text-2xl font-black text-white font-mono tabular-nums">{value}</p>
      {sub && (
        <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>
      )}
      {trend && (
        <span className={`inline-block mt-1 text-[10px] font-bold ${
          trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-zinc-400'
        }`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trend}
        </span>
      )}
    </div>
  );
}
