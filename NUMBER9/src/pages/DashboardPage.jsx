import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Icon } from '../components/icons'
import { fetchUserTransactions } from '../store/wallet'
import { listBids } from '../store/king'
import { useI18n } from '../i18n'
import PageShell from '../components/ui/PageShell'
import { SkeletonCard, Shimmer } from '../components/ui/Skeleton'
import { wibDate, wibTime } from '../utils/wib'

const fmt = (n) => Number(n || 0).toLocaleString()

export default function DashboardPage() {
  const auth = useStore(s => s.auth)
  const { clientUuid } = useParams()
  const tb = useStore(s => s.totalBalance)
  const ab = useStore(s => s.availableBalance)
  const lb = useStore(s => s.lockedBalance)
  const _rtTick = useStore(s => s._rtTick)
  const fetchBalances = useStore(s => s.fetchBalances)
  const p = (path) => `/c/${clientUuid}${path}`
  const who = auth?.displayName || auth?.username || 'User'
  const { t } = useI18n()
  const [clock, setClock] = useState(() => wibTime())
  useEffect(() => { const i = setInterval(() => setClock(wibTime()), 1000); return () => clearInterval(i) }, [])

  const [userTxs, setUserTxs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchBalances(),
      auth?.id ? fetchUserTransactions(auth.id, 10) : Promise.resolve([]),
    ]).then(([, txs]) => {
      setUserTxs(txs || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [fetchBalances, auth?.id, _rtTick])

  const acts = useMemo(() => {
    if (!auth?.username) return []
    const txs = userTxs
    const bids = listBids().filter(b => b.result).slice(0, 5)
    const txActs = txs.slice(0, 10).map(tx => ({
      id: tx.id,
      type: tx.type === 'DEPOSIT' ? 'DEP' : 'WD',
      desc: t(tx.type === 'DEPOSIT' ? 'dashboard.deposit_label' : 'dashboard.withdraw_label', { method: tx.method || '—' }),
      amount: `${tx.type === 'DEPOSIT' ? '+' : '-'}${(tx.amount || 0).toLocaleString()} ${t('common.points')}`,
      date: wibDate(tx.requestedAt),
      ts: tx.requestedAt ? new Date(tx.requestedAt).getTime() : 0,
      status: tx.status,
    }))
    const bidActs = bids.map(b => ({
      id: b.clientBetId,
      type: 'POS',
      desc: t('dashboard.position_label', { code: b.betCode, session: b.sessionCode?.slice(-6) || '—' }),
      amount: b.result === 'WIN' ? `+${((b.payout || 0) - b.stake).toLocaleString()} ${t('common.points')}` : `-${(b.stake || 0).toLocaleString()} ${t('common.points')}`,
      date: wibDate(b.settledAt || b.placedAt),
      ts: b.settledAt ? new Date(b.settledAt).getTime() : (b.placedAt ? new Date(b.placedAt).getTime() : 0),
      status: b.result,
    }))
    return [...txActs, ...bidActs].sort((a, b) => b.ts - a.ts).slice(0, 5)
  }, [userTxs, auth?.id, t])

  if (loading) {
    return (
      <PageShell
        max="wide"
        className="relative"
        title={t('dashboard.welcome_back', { name: who })}
        actions={
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
            <span className="font-mono text-[13px] font-black text-yellow-400 tabular-nums">{clock}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">WIB</span>
          </div>
        }
      >
        <div className="space-y-6">
          <div>
            <Shimmer className="h-3 w-48 mb-3" />
            <div className="flex items-baseline gap-3">
              <Shimmer className="h-12 w-40" />
              <Shimmer className="h-6 w-16" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
          <div className="flex gap-3">
            <Shimmer className="h-10 w-28 rounded-lg" />
            <Shimmer className="h-10 w-28 rounded-lg" />
            <Shimmer className="h-10 w-28 rounded-lg" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-4">
              <Shimmer className="h-5 w-40" />
              <Shimmer className="h-4 w-16" />
            </div>
            <div className="space-y-3">
              {[1,2,3,4].map(i => (
                <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-[#0c0e14] border border-[#1f2128]">
                  <div className="flex items-center gap-4">
                    <Shimmer className="h-4 w-10" />
                    <div>
                      <Shimmer className="h-4 w-48 mb-1" />
                      <Shimmer className="h-3 w-24" />
                    </div>
                  </div>
                  <Shimmer className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      max="wide"
      className="relative"
      title={t('dashboard.welcome_back', { name: who })}
      actions={
        <div className="hidden sm:flex items-center gap-2 rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
          <span className="font-mono text-[13px] font-black text-yellow-400 tabular-nums">{clock}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">WIB</span>
        </div>
      }
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <img src="/assets/img/hero-globe.png" alt="" className="absolute -top-32 right-0 h-[800px] w-[800px] max-w-none object-contain opacity-40" />
      </div>

      <div className="space-y-6 relative z-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-4">{t('dashboard.portfolio_value')}</p>
          <div className="flex items-baseline gap-3">
            <h2 className="text-5xl font-black text-white">{fmt(tb)}</h2>
            <span className="text-2xl font-bold text-yellow-400">{t('common.points')}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-[#1f2128] p-4 hover:border-white/20 transition">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">{t('dashboard.buying_power')}</p>
            <p className="text-2xl font-bold text-yellow-400">{fmt(ab)} {t('common.points')}</p>
          </div>
          <div className="rounded-lg border border-[#1f2128] p-4 hover:border-white/20 transition">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">{t('dashboard.reserved')}</p>
            <p className="text-2xl font-bold text-zinc-300">{fmt(lb)} {t('common.points')}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t border-[#1f2128]">
          <Link to={p('/deposit')} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-400 text-black font-semibold text-sm hover:bg-yellow-300 transition">
            <Icon.ArrowDown size={14} /> {t('dashboard.deposit')}
          </Link>
          <Link to={p('/withdraw')} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1f2128] text-white font-semibold text-sm hover:border-white/30 transition">
            <Icon.ArrowUp size={14} /> {t('dashboard.withdraw')}
          </Link>
          <Link to={p('/king')} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1f2128] text-white font-semibold text-sm hover:border-white/30 transition">
            <Icon.Trade size={14} /> {t('dashboard.marketplace')}
          </Link>
          <Link to={p('/turnover')} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-yellow-400/30 text-yellow-400 font-semibold text-sm hover:border-yellow-400/60 transition">
            <Icon.Trade size={14} /> Turnover
          </Link>
        </div>
      </div>

      <div className="h-px bg-linear-to-r from-[#1f2128] via-[#1f2128]/50 to-transparent" />

      <section className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">{t('dashboard.recent_activity')}</h2>
          <Link to={p('/history')} className="text-xs font-semibold text-yellow-400 hover:text-yellow-300 transition">
            {t('common.see_all')} →
          </Link>
        </div>

        {acts.length > 0 ? (
          <div className="space-y-3">
            {acts.map((a) => {
              const isDone = a.status === 'COMPLETED' || a.status === 'APPROVED'
              const isFailed = a.status === 'FAILED' || a.status === 'REJECTED'
              const isPending = !isDone && !isFailed
              const typeColor = a.type === 'DEP'
                ? (isDone ? 'text-emerald-400' : isPending ? 'text-amber-400' : 'text-red-400')
                : a.type === 'WD' ? 'text-red-400' : 'text-yellow-400'
              const amountColor = a.type === 'DEP'
                ? (isDone ? 'text-emerald-400' : isPending ? 'text-amber-400' : 'text-red-400')
                : (a.type === 'WD' ? 'text-zinc-400' : (String(a.amount).startsWith('+') ? 'text-emerald-400' : 'text-zinc-400'))
              const statusLabel = isDone ? null : isPending ? 'Menunggu' : 'Ditolak'
              const statusPillClass = isPending
                ? 'bg-amber-400/10 text-amber-400'
                : 'bg-red-400/10 text-red-400'
              return (
                <div key={a.id} className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-white/5 transition">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className={`text-xs font-black uppercase tracking-widest w-10 shrink-0 ${typeColor}`}>{a.type}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{a.desc}</p>
                        {statusLabel && (
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${statusPillClass}`}>
                            {statusLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{a.date}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-bold tabular-nums shrink-0 ml-4 ${amountColor}`}>
                    {a.amount}
                  </p>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm py-8 text-center">{t('dashboard.no_activity')}</p>
        )}
      </section>

      <div className="relative z-10 pt-8 border-t border-[#1f2128]">
        <p className="text-xs text-zinc-500 leading-relaxed">
          {t('dashboard.disclaimer')}
        </p>
      </div>
    </PageShell>
  )
}
