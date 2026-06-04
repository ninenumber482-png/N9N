import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Icon } from '../components/icons'
import BackLink from '../components/ui/BackLink'
import { useI18n } from '../i18n'
import { useParams } from 'react-router-dom'

export default function ReferralPage() {
  const auth = useStore(s => s.auth)
  const getUserByUsername = useStore(s => s.getUserByUsername)
  const { t } = useI18n()
  const { clientUuid } = useParams()
  const p = (path) => `/c/${clientUuid}${path}`
  const [copied, setCopied] = useState(false)

  const me = getUserByUsername(auth?.username) || {}
  const isActive = (me.accountStatus || me.account_status) === 'ACTIVE'
  const code = isActive ? me.referralCode : null

  const copy = () => {
    if (!code) return
    navigator.clipboard?.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <BackLink to={p('/dashboard')}>{t('common.back_to_dashboard')}</BackLink>

      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="border-b border-[#1f2128] px-3 py-2 lg:px-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-400">{t('referral.title')}</p>
            <span className="text-[10px] font-bold text-zinc-500">{isActive ? t('referral.active') : t('referral.pending')}</span>
          </div>
        </div>
        <div className="px-3 py-3 lg:px-4 lg:py-4">
          {isActive && code ? (
            <>
              <div className="flex items-stretch gap-1.5">
                <div className="flex flex-1 items-center rounded-lg border border-[#1f2128] bg-[#13151c] px-3 font-mono text-base font-extrabold tracking-widest text-white lg:text-2xl">
                  {code}
                </div>
                <button onClick={copy} className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-yellow-400 px-3 text-[12px] font-extrabold text-black hover:bg-yellow-300 active:scale-[0.99] lg:px-5 lg:text-sm">
                  {copied ? <><Icon.Check size={14} /> {t('referral.copied')}</> : <><Icon.Copy size={14} /> {t('referral.copy')}</>}
                </button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {[
                  [t('referral.total'), '—'],
                  [t('referral.active_users'), '—'],
                  [t('referral.this_month'), '—'],
                  [t('referral.earned'), '—'],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg border border-[#1f2128] bg-[#13151c] px-1.5 py-1.5 lg:px-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{l}</p>
                    <p className="mt-0.5 text-[12px] font-extrabold tabular-nums text-white lg:text-sm">{v}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-yellow-400/30 bg-[#13151c] p-3">
              <span className="mt-0.5 text-yellow-400"><Icon.Warn size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-white">{t('referral.pending_title')}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                  {t('referral.pending_desc')}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
