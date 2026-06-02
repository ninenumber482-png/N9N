import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import PageShell from '../components/ui/PageShell'
import { useI18n } from '../i18n'
import { wibDate } from '../utils/wib'
import { useParams } from 'react-router-dom'

export default function MyNetworkPage() {
  const { t } = useI18n()
  const auth = useStore(s => s.auth)
  const { clientUuid } = useParams()
  const p = (path) => `/c/${clientUuid}${path}`
  const getUserByUsername = useStore(s => s.getUserByUsername)
  const fetchDownlines = useStore(s => s.fetchDownlines)

  const me = getUserByUsername(auth?.username) || {}
  const isActive = me.account_status === 'ACTIVE'

  // Downlines = users who registered with me as their referrer (DB-backed, not local cache).
  const [downlines, setDownlines] = useState([])
  useEffect(() => {
    let alive = true
    fetchDownlines().then(list => { if (alive) setDownlines(list) })
    return () => { alive = false }
  }, [fetchDownlines, auth?.id])

  const activeCount = downlines.filter(d => d.account_status === 'ACTIVE').length
  const pendingCount = downlines.filter(d => d.registration_status === 'PENDING').length

  return (
    <PageShell
      title={t('network.title')}
      back={{ to: p('/dashboard'), label: t('common.back_to_dashboard') }}
    >
      {/* My Referral Code */}
      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="border-b border-[#1f2128] px-3 py-2 lg:px-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-400">{t('referral.my_code')}</p>
        </div>
        <div className="px-3 py-3 lg:px-4 lg:py-4">
          {isActive && me.referralCode ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-1 items-center rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-2 font-mono text-lg font-extrabold tracking-widest text-white">
                {me.referralCode}
              </div>
              <span className="text-[10px] font-bold text-emerald-400">{t('referral.active')}</span>
            </div>
          ) : (
            <div className="rounded-lg border border-yellow-400/30 bg-[#13151c] p-3">
              <p className="text-[12px] text-zinc-400">{t('referral.pending_desc')}</p>
            </div>
          )}
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-2">
        {[
          [t('network.total'), downlines.length],
          [t('network.active'), activeCount],
          [t('network.pending'), pendingCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[#1f2128] bg-[#0c0e14] px-3 py-3 text-center">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-white">{value}</p>
          </div>
        ))}
      </section>

      {/* Downline Table */}
      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="border-b border-[#1f2128] px-3 py-2 lg:px-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-400">{t('network.downlines')}</p>
        </div>
        <div className="overflow-x-auto">
          {downlines.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-zinc-500">{t('network.no_downlines')}</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1f2128] text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                  <th className="px-3 py-2">{t('common.username')}</th>
                  <th className="px-3 py-2">{t('common.status')}</th>
                  <th className="px-3 py-2">{t('common.registration')}</th>
                  <th className="px-3 py-2">{t('common.date')}</th>
                </tr>
              </thead>
              <tbody>
                {downlines.map(d => (
                  <tr key={d.uuid} className="border-b border-[#1f2128] transition-colors hover:bg-[#13151c]">
                    <td className="px-3 py-2 font-mono text-[11px] font-bold text-white">{d.username}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        d.account_status === 'ACTIVE' ? 'bg-emerald-400/10 text-emerald-400' :
                        d.account_status === 'PENDING' ? 'bg-amber-400/10 text-amber-400' :
                        'bg-red-400/10 text-red-400'
                      }`}>{d.account_status}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                        d.registration_status === 'APPROVED' ? 'bg-emerald-400/10 text-emerald-400' :
                        d.registration_status === 'PENDING' ? 'bg-amber-400/10 text-amber-400' :
                        'bg-red-400/10 text-red-400'
                      }`}>{d.registration_status}</span>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-zinc-500">{wibDate(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </PageShell>
  )
}
