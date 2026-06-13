import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { Icon } from '../components/icons'
import BackLink from '../components/ui/BackLink'
import SectionHead from '../components/ui/SectionHead'
import Toast from '../components/ui/Toast'
import ModalOverlay from '../components/ui/ModalOverlay'
import { useI18n } from '../i18n'
import { useParams } from 'react-router-dom'
import { fetchCsContact } from '../utils/csContact'
import { wibDateTime } from '../utils/wib'
import {
  listMyTickets, getTicketThread, createTicket, sendTicketMessage, uploadTicketImage,
} from '../utils/tickets'

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

  const [cs, setCs] = useState(null)
  useEffect(() => {
    let alive = true
    if (!auth?.id) return
    fetchCsContact().then((c) => { if (alive) setCs(c) }).catch(() => {})
    return () => { alive = false }
  }, [auth?.id])

  const FAQS = [
    { q: t('support.faq_1_q'), a: t('support.faq_1_a') },
    { q: t('support.faq_2_q'), a: t('support.faq_2_a') },
    { q: t('support.faq_3_q'), a: t('support.faq_3_a') },
    { q: t('support.faq_4_q'), a: t('support.faq_4_a') },
    { q: t('support.faq_5_q'), a: t('support.faq_5_a') },
  ]

  // ── ticket chat state ──
  const [tickets, setTickets] = useState([])
  const [ticketsLoading, setTicketsLoading] = useState(true)
  const [openId, setOpenId] = useState(null)       // open thread ticket id
  const [thread, setThread] = useState(null)       // {ticket, messages}
  const [reply, setReply] = useState('')
  const [replyImg, setReplyImg] = useState('')     // base64 preview
  const [sending, setSending] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [nt, setNt] = useState({ subject: '', category: 'OTHER', message: '', img: '' })
  const [toast, setToast] = useState(null)

  // initial + 15s list refresh
  useEffect(() => {
    if (!auth?.id) return
    let alive = true
    const load = () => listMyTickets().then((r) => { if (alive) { setTickets(r); setTicketsLoading(false) } })
    load()
    const i = setInterval(load, 15000)
    return () => { alive = false; clearInterval(i) }
  }, [auth?.id])

  // open thread + 3.5s poll while open
  useEffect(() => {
    if (!openId) return // modal hides via openId; thread is matched by id at render
    let alive = true
    const load = () => getTicketThread(openId).then((r) => {
      if (!alive) return
      if (r?.error) { setToast({ type: 'err', text: r.error }); setOpenId(null); return }
      setThread(r)
    })
    load()
    const i = setInterval(load, 3500)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { alive = false; clearInterval(i); window.removeEventListener('focus', onFocus) }
  }, [openId])

  const onPickImg = (e, setter) => {
    const f = e.target.files?.[0]; if (!f) return
    const r = new FileReader()
    r.onload = (ev) => setter(ev.target.result)
    r.onerror = () => setToast({ type: 'err', text: t('common.file_read_error') })
    r.readAsDataURL(f)
  }

  const doCreate = async () => {
    if (!nt.subject.trim() || !nt.message.trim()) return
    setSending(true)
    let imageUrl = null
    if (nt.img) imageUrl = await uploadTicketImage(nt.img)
    const r = await createTicket({ subject: nt.subject, category: nt.category, message: nt.message, imageUrl })
    setSending(false)
    if (r?.error) return setToast({ type: 'err', text: t('support.ticket_create_failed') })
    setShowNew(false)
    setNt({ subject: '', category: 'OTHER', message: '', img: '' })
    const fresh = await listMyTickets(); setTickets(fresh)
    setOpenId(r.id)
  }

  const doSend = async () => {
    if (!openId || (!reply.trim() && !replyImg)) return
    setSending(true)
    let imageUrl = null
    if (replyImg) imageUrl = await uploadTicketImage(replyImg)
    const r = await sendTicketMessage(openId, reply, imageUrl)
    setSending(false)
    if (r?.error) {
      const msg = r.error.includes('TICKET_CLOSED') ? t('support.ticket_closed_note')
        : r.error.includes('RATE_LIMIT') ? t('support.ticket_rate_limit')
        : r.error.includes('TOO_LONG') ? t('support.ticket_too_long')
        : t('support.ticket_send_failed')
      return setToast({ type: 'err', text: msg })
    }
    setReply(''); setReplyImg('')
    getTicketThread(openId).then((x) => { if (!x?.error) setThread(x) })
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
          <div className="flex shrink-0 gap-2">
            {cs?.tgOk && (
              <a href={cs.tgHref} target="_blank" rel="noopener noreferrer"
                className="rounded bg-sky-500 px-3.5 py-2 text-[12px] font-extrabold text-white hover:bg-sky-400 active:scale-[0.99] lg:px-5 lg:py-2.5"
              >Telegram</a>
            )}
            {cs?.waOk && (
              <a href={cs.waHref} target="_blank" rel="noopener noreferrer"
                className="rounded bg-emerald-500 px-3.5 py-2 text-[12px] font-extrabold text-white hover:bg-emerald-400 active:scale-[0.99] lg:px-5 lg:py-2.5"
              >WhatsApp</a>
            )}
            {!cs?.anyActive && (
              <span className="rounded bg-[#13151c] px-3.5 py-2 text-[12px] font-bold text-zinc-500 lg:px-5 lg:py-2.5">
                {t('support.cs_unavailable')}
              </span>
            )}
          </div>
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

        {/* ── My Tickets ── */}
        <section className="lg:col-span-2">
          <SectionHead>{t('support.tickets_title')}</SectionHead>
          <div className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
            <div className="flex items-center justify-end border-b border-[#1f2128] px-3 py-2">
              <button onClick={() => setShowNew(true)}
                className="rounded bg-yellow-400 px-3 py-1.5 text-[11px] font-extrabold text-black hover:bg-yellow-300">
                {t('support.new_ticket')}
              </button>
            </div>
            <div className="divide-y divide-[#1f2128]">
              {ticketsLoading && <div className="px-4 py-6 text-center text-xs text-zinc-500">…</div>}
              {!ticketsLoading && tickets.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-zinc-500">{t('support.no_tickets')}</div>
              )}
              {tickets.map((tk) => (
                <button key={tk.id} onClick={() => setOpenId(tk.id)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.02]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[12px] font-bold text-white">{tk.subject}</p>
                      {tk.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400" title={t('support.ticket_unread')} />}
                    </div>
                    <p className="truncate text-[10px] text-zinc-500">{tk.last_message_preview || ''}</p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                    tk.status === 'CLOSED' ? 'bg-zinc-700/40 text-zinc-400'
                    : tk.status === 'REPLIED' ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-yellow-400/15 text-yellow-400'}`}>
                    {t('support.ticket_status_' + (tk.status || 'open').toLowerCase())}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── Thread modal (only when the loaded thread matches the open id) ── */}
      {openId && thread?.ticket?.id === openId && (
        <ModalOverlay open={!!openId} onClose={() => setOpenId(null)} className="items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <div className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0e1017]">
            <div className="flex items-center justify-between border-b border-[#1f2128] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-extrabold text-white">{thread.ticket?.subject}</p>
                <p className="text-[10px] text-zinc-500">{thread.ticket?.category} · {t('support.ticket_status_' + (thread.ticket?.status || 'open').toLowerCase())}</p>
              </div>
              <button onClick={() => setOpenId(null)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#1f2128] text-zinc-500 hover:text-white">✕</button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {(thread.messages || []).map((m) => (
                <div key={m.id} className={`flex ${m.sender_type === 'USER' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.sender_type === 'USER' ? 'bg-yellow-400 text-black' : 'bg-[#1f2128] text-zinc-100'}`}>
                    {m.image_url && <img src={m.image_url} alt="" className="mb-1 max-h-40 rounded-lg" />}
                    {m.body && <p className="text-[12px] whitespace-pre-wrap break-words">{m.body}</p>}
                    <p className={`mt-0.5 text-[8px] ${m.sender_type === 'USER' ? 'text-black/50' : 'text-zinc-500'}`}>{wibDateTime(m.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
            {thread.ticket?.status === 'CLOSED' ? (
              <div className="border-t border-[#1f2128] px-4 py-3 text-center text-[11px] text-zinc-500">{t('support.ticket_closed_note')}</div>
            ) : (
              <div className="border-t border-[#1f2128] p-3">
                {replyImg && <img src={replyImg} alt="" className="mb-2 max-h-24 rounded-lg" />}
                <div className="flex items-end gap-2">
                  <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-[#1f2128] text-zinc-400 hover:text-white" title={t('support.ticket_attach')}>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImg(e, setReplyImg)} />📎
                  </label>
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={1}
                    placeholder={t('support.ticket_reply_ph')}
                    className="max-h-24 flex-1 resize-none rounded-lg border border-[#1f2128] bg-[#0e1117] px-3 py-2 text-[12px] text-white outline-none focus:border-yellow-400/50" />
                  <button onClick={doSend} disabled={sending || (!reply.trim() && !replyImg)}
                    className="h-9 shrink-0 rounded-lg bg-yellow-400 px-4 text-[12px] font-extrabold text-black hover:bg-yellow-300 disabled:opacity-40">
                    {t('support.ticket_send')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </ModalOverlay>
      )}

      {/* ── New Ticket modal ── */}
      {showNew && (
        <ModalOverlay open={showNew} onClose={() => setShowNew(false)} className="items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-[#0e1017] p-5">
            <p className="mb-4 text-[14px] font-extrabold text-white">{t('support.ticket_create')}</p>
            <div className="space-y-3">
              <input value={nt.subject} onChange={(e) => setNt((pr) => ({ ...pr, subject: e.target.value }))}
                placeholder={t('support.ticket_subject')} className={inp} />
              <select value={nt.category} onChange={(e) => setNt((pr) => ({ ...pr, category: e.target.value }))} className={inp}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{t(c.i18n)}</option>)}
              </select>
              <textarea value={nt.message} onChange={(e) => setNt((pr) => ({ ...pr, message: e.target.value }))} rows={4}
                placeholder={t('support.ticket_message')} className={inp + ' resize-none !h-auto py-2'} />
              {nt.img && <img src={nt.img} alt="" className="max-h-28 rounded-lg" />}
              <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400 hover:text-white">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImg(e, (v) => setNt((pr) => ({ ...pr, img: v })))} />
                📎 {t('support.ticket_attach')}
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowNew(false)} className="h-10 flex-1 rounded-lg border border-[#1f2128] text-[12px] font-bold text-zinc-300 hover:text-white">{t('common.cancel')}</button>
                <button onClick={doCreate} disabled={sending || !nt.subject.trim() || !nt.message.trim()}
                  className="h-10 flex-1 rounded-lg bg-yellow-400 text-[12px] font-extrabold text-black hover:bg-yellow-300 disabled:opacity-40">{t('support.ticket_create')}</button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
