import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { Icon } from '../components/icons'
import BackLink from '../components/ui/BackLink'
import SectionHead from '../components/ui/SectionHead'
import { useI18n } from '../i18n'
import { supabase } from '../utils/supabase'
import { useParams } from 'react-router-dom'
import { setCsConfig as cacheCsConfig, getCsConfig } from '../utils/csConfigCache'

const inp = 'h-9 w-full rounded border border-[#1f2128] bg-[#0e1117] px-3 text-[12px] text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400/60'

/* Category keys are stored as stable identifiers (not translated strings),
   then translated at display time — so changing language mid-form keeps
   the dropdown value aligned with the visible label. */
const CATEGORIES = [
  { key: 'DEPOSIT',    i18n: 'support.cat_deposit' },
  { key: 'TRADING',    i18n: 'support.cat_trading' },
  { key: '3DKING',     i18n: 'support.cat_3dking' },
  { key: 'KYC',        i18n: 'support.cat_kyc' },
  { key: 'REFERRAL',   i18n: 'support.cat_referral' },
  { key: 'OTHER',      i18n: 'support.cat_other' },
];

export default function SupportPage() {
  const { t } = useI18n()
  const auth = useStore(s => s.auth)
  const { clientUuid } = useParams()
  const p = (path) => `/c/${clientUuid}${path}`
  const [openFaq, setOpenFaq] = useState(-1)

  const [csConfig, setCsConfig] = useState(() => getCsConfig())
  useEffect(() => {
    if (csConfig) return
    supabase.rpc('get_public_config').then(({ data, error }) => {
      if (error || !data) return
      const map = {}
      data.forEach(r => map[r.key] = r.value)
      cacheCsConfig(map)
      setCsConfig(map)
    })
  }, [csConfig])

  const FAQS = [
    { q: t('support.faq_1_q'), a: t('support.faq_1_a') },
    { q: t('support.faq_2_q'), a: t('support.faq_2_a') },
    { q: t('support.faq_3_q'), a: t('support.faq_3_a') },
    { q: t('support.faq_4_q'), a: t('support.faq_4_a') },
    { q: t('support.faq_5_q'), a: t('support.faq_5_a') },
  ]
  const [ticketSubject, setTicketSubject] = useState('')
  const [ticketCategory, setTicketCategory] = useState('DEPOSIT')
  const [ticketMessage, setTicketMessage] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmitTicket = async () => {
    if (submitting) return
    if (!ticketSubject.trim() || !ticketMessage.trim()) {
      setFeedback({ type: 'err', text: t('support.validation') })
      return
    }
    if (!auth?.id) {
      setFeedback({ type: 'err', text: t('common.login_required') })
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: auth.id,
          subject: ticketSubject.trim(),
          category: ticketCategory,
          message: ticketMessage.trim(),
          status: 'OPEN'
        })
      if (error) throw error
      setFeedback({ type: 'ok', text: t('support.success') })
      setTicketSubject('')
      setTicketCategory('DEPOSIT')
      setTicketMessage('')
    } catch {
      setFeedback({ type: 'err', text: t('support.failed') })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <BackLink to={p('/dashboard')}>{t('common.back')}</BackLink>
      {/* LIVE CHAT */}
      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="border-b border-[#1f2128] px-3 py-2 lg:px-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-400">{t('support.title')}</p>
        </div>
        <div className="flex items-center gap-3 px-3 py-3 lg:px-4">
          <span className="grid h-10 w-10 place-items-center rounded border border-yellow-400/30 bg-[#13151c] text-yellow-400 lg:h-12 lg:w-12">
            <Icon.Chat size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-white lg:text-base">{t('support.live_chat')}</p>
            <p className="text-[10px] text-zinc-500">{t('support.live_chat_hours')}</p>
          </div>
          <button
            onClick={() => {
              const wa = csConfig?.cs_wa_number?.replace(/[^\d]/g, '')
              if (!wa) return
              const msg = encodeURIComponent(csConfig?.cs_welcome_message || 'Hello, I need assistance.')
              window.open(`https://wa.me/${wa}?text=${msg}`, '_blank', 'noopener,noreferrer')
            }}
            disabled={!csConfig?.cs_wa_number}
            className="shrink-0 rounded bg-yellow-400 px-3.5 py-2 text-[12px] font-extrabold text-black hover:bg-yellow-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 lg:px-5 lg:py-2.5"
          >{t('support.start_chat')}</button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
        <section className="lg:col-span-3">
          <SectionHead>{t('support.faqs')}</SectionHead>
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

        <section className="lg:col-span-2">
          <SectionHead>{t('support.submit_ticket')}</SectionHead>
          <div className="space-y-1.5 rounded-xl border border-[#1f2128] bg-[#0c0e14] p-2.5 lg:p-3">
            <Field label={t('support.subject')}><input type="text" placeholder={t('support.subject_placeholder')} className={inp} value={ticketSubject} onChange={e => setTicketSubject(e.target.value)} /></Field>
            <Field label={t('support.category')}>
              <select className={inp} value={ticketCategory} onChange={e => setTicketCategory(e.target.value)}>
                {CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{t(c.i18n)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('support.message')}>
              <textarea className="min-h-20 w-full resize-y rounded border border-[#1f2128] bg-[#0e1117] px-3 py-2 text-[12px] text-white outline-none placeholder:text-zinc-500 focus:border-yellow-400/60" placeholder={t('support.message_placeholder')} value={ticketMessage} onChange={e => setTicketMessage(e.target.value)} />
            </Field>
            <button onClick={handleSubmitTicket} disabled={submitting} className="h-9 w-full rounded bg-yellow-400 text-[12px] font-extrabold text-black hover:bg-yellow-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" /></span> : t('support.submit')}</button>
            {feedback && (
              <p className={`text-[11px] mt-1 ${feedback.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{feedback.text}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  )
}
