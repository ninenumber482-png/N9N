import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { fetchTurnoverSummary } from '../store/wallet'
import { supabase } from '../utils/supabase'
import { Icon } from '../components/icons'
import Spinner from '../components/ui/Spinner'
import Toast from '../components/ui/Toast'
import PageShell from '../components/ui/PageShell'
import SectionHead from '../components/ui/SectionHead'
import useAlive from '../hooks/useAlive'
import { useI18n } from '../i18n'

export default function TurnoverPage() {
  const { t } = useI18n()
  const { clientUuid } = useParams()
  const p = (path) => `/c/${clientUuid}${path}`
  const [openFaq, setOpenFaq] = useState(0)
  const [toast, setToast] = useState(null)
  const aliveRef = useAlive()

  const FAQS = useMemo(() => [
    { q: t('turnover.q1'), a: t('turnover.q1_a') },
    { q: t('turnover.q2'), a: t('turnover.q2_a') },
    { q: t('turnover.q3'), a: t('turnover.q3_a') },
  ], [t])
  const auth = useStore(s => s.auth)
  const _rtTick = useStore((s) => s._rtTick)
  const [data, setData] = useState({ required: 0, achieved: 0, remaining: 0, pct: 0, totalDeposited: 0, locks: [], isUnlocked: false })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState(null)
  const isInitialLoadRef = useRef(true)

  const refetch = useCallback(async () => {
    if (!auth?.id) return
    const isInitial = isInitialLoadRef.current
    if (!isInitial) setRefreshing(true)
    try {
      const d = await fetchTurnoverSummary(auth.id)
      if (aliveRef.current) {
        setData(d)
        setLastFetchedAt(new Date())
        setLoading(false)
        isInitialLoadRef.current = false
      }
    } catch (e) {
      if (aliveRef.current) {
        setToast({ type: 'err', text: t('common.network_error') })
        setLoading(false)
        isInitialLoadRef.current = false
      }
    } finally {
      if (aliveRef.current) setRefreshing(false)
    }
  }, [auth?.id, aliveRef, t])

  useEffect(() => {
    if (!auth?.id) return
    if (isInitialLoadRef.current) setLoading(true)
    refetch()
  }, [auth?.id, _rtTick, refetch])

  // Subscribe to deposit_locks changes so turnover_applied updates auto-refresh
  useEffect(() => {
    if (!auth?.id || !supabase) return
    const channel = supabase
      .channel(`deposit_locks_${auth.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'deposit_locks',
        filter: `user_id=eq.${auth.id}`,
      }, () => {
        if (aliveRef.current) refetch()
      })
      .subscribe();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [auth?.id, refetch, aliveRef])

  const totalDeposit = data.totalDeposited
  const totalRequired = data.required
  const totalAchieved = data.achieved
  const pct = data.pct

  return (
    <PageShell
      title={t('turnover.title')}
      back={{ to: p('/dashboard'), label: t('common.back') }}
    >
      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="border-b border-[#1f2128] px-3 py-2 lg:px-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-400">{t('turnover.title')}</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-500">{totalAchieved.toLocaleString()} / {totalRequired.toLocaleString()}</span>
              <button
                onClick={refetch}
                disabled={refreshing}
                className="rounded p-1 text-zinc-500 hover:text-yellow-400 disabled:opacity-50"
                title="Refresh"
              >
                <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>
                  <Icon.Refresh size={12} />
                </span>
              </button>
            </div>
          </div>
          {lastFetchedAt && (
            <p className="mt-1 text-[9px] text-zinc-600">Updated {lastFetchedAt.toLocaleTimeString()}</p>
          )}
        </div>
        <div className="px-3 py-3 lg:px-4 lg:py-4">
          {data.isUnlocked ? (
            <>
              <p className="text-2xl font-black leading-tight text-yellow-400 lg:text-3xl">✓ {t('turnover.unlocked')}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('turnover.unlocked_sub')}</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-black leading-none tabular-nums text-white lg:text-5xl">{pct}<span className="text-2xl text-yellow-400">{t('turnover.percent')}</span></p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('turnover.to_unlock')}</p>
            </>
          )}
          <div className="mt-3 h-2.5 overflow-hidden rounded-lg bg-[#1f2128]">
            <div className="h-full bg-yellow-400 transition-all duration-700" style={{ width: `${data.isUnlocked ? 100 : pct}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {[[t('turnover.deposit'), totalDeposit.toLocaleString()], [t('turnover.required'), totalRequired.toLocaleString()], [t('turnover.done'), totalAchieved.toLocaleString(), true], [t('turnover.left'), data.remaining.toLocaleString()]].map(([l, v, a]) => (
              <div key={l} className="rounded-lg border border-[#1f2128] bg-[#13151c] px-1.5 py-1.5 lg:px-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{l}</p>
                <p className={`mt-0.5 text-[12px] font-extrabold tabular-nums lg:text-sm ${a ? 'text-yellow-400' : 'text-white'}`}>{v} {t('common.points')}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionHead>{t('turnover.breakdown')}</SectionHead>
        <div className="divide-y divide-[#1f2128] rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          {loading && (
            <Spinner size="sm" />
          )}
          {!loading && (data.locks?.length ?? 0) === 0 && (
            <div className="px-3 py-4 text-center">
              <p className="text-[11px] text-zinc-500">{t('turnover.no_activity')}</p>
              {data.totalDeposited > 0 && (
                <p className="mt-1 text-[10px] text-yellow-500/70">Deposit locks not visible — try refresh button above</p>
              )}
            </div>
          )}
          {!loading && data.locks?.map((l, i) => (
            <div key={i} className="px-2.5 py-2 lg:px-3">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-[12px] font-bold text-white lg:text-[13px]">
                  {t('turnover.deposit')} {l.amount.toLocaleString()} P × 1×
                </p>
                {l.done ? (
                  <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400">✓ {t('turnover.done')}</span>
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    {l.applied.toLocaleString()} / {l.required.toLocaleString()} · {l.pct}%
                  </span>
                )}
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#1f2128]">
                <div className={`h-full transition-all duration-700 ${l.done ? 'bg-yellow-400' : 'bg-zinc-500'}`} style={{ width: `${l.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHead>{t('turnover.rules')}</SectionHead>
        <div className="divide-y divide-[#1f2128] rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          {FAQS.map((f, i) => {
            const open = openFaq === i
            return (
              <div key={i}>
                <button onClick={() => setOpenFaq(open ? -1 : i)} className="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left lg:px-3">
                  <span className={`text-[12px] font-bold lg:text-[13px] ${open ? 'text-yellow-400' : 'text-white'}`}>{f.q}</span>
                  <span className={`shrink-0 transition ${open ? 'rotate-180 text-yellow-400' : 'text-zinc-500'}`}><Icon.ChevronDown size={14} /></span>
                </button>
                {open && <p className="px-2.5 pb-2 text-[11px] leading-relaxed text-zinc-400 lg:px-3 lg:text-[12px]">{f.a}</p>}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <SectionHead>{t('turnover.grow')}</SectionHead>
        <div className="flex gap-2 px-3">
          <Link to={p('/king')} className="flex-1 rounded-lg bg-yellow-400 py-2 text-center text-[11px] font-bold text-black hover:bg-yellow-300">{t('turnover.trade_marketplace')}</Link>
          <Link to={p('/trading')} className="flex-1 rounded-lg border border-[#1f2128] py-2 text-center text-[11px] font-bold text-zinc-300 hover:text-white">{t('turnover.trade_now')}</Link>
        </div>
      </section>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </PageShell>
  )
}
