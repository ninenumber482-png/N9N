import { useEffect, useState } from 'react'
import { useStore } from '../../store/useStore'
import { fetchCsContact } from '../../utils/csContact'

const WaIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
)
const TgIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
)

/**
 * CsWidget — floating customer-service launcher.
 * LOGIN-ONLY: renders nothing unless a user is authenticated (auth?.id). Config
 * (Telegram/WhatsApp ON-OFF + links) comes from the auth-gated `get_cs_contact`
 * RPC, so anon users can neither see the widget nor reach the links via the API.
 * If both channels are off, the widget is not shown.
 */
export default function CsWidget() {
  const auth = useStore((s) => s.auth)
  const [cs, setCs] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!auth?.id) return // not logged in → render guard below returns null
    let alive = true
    fetchCsContact().then((c) => { if (alive) setCs(c) }).catch(() => {})
    return () => { alive = false }
  }, [auth?.id])

  // Backend already gates by token; this is defense-in-depth on the frontend.
  if (!auth?.id) return null
  if (!cs?.anyActive) return null

  return (
    <>
      {/* Floating launcher — neutral brand color (multi-channel, not WA-only) */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-[max(5rem,calc(5rem+env(safe-area-inset-bottom)))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-400 text-black shadow-lg shadow-yellow-400/30 hover:bg-yellow-300 hover:shadow-yellow-400/50 hover:scale-110 transition-all duration-200 active:scale-95 lg:bottom-6"
        aria-label="Contact customer service"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      {open && (
        <div className="fixed bottom-[max(9rem,calc(9rem+env(safe-area-inset-bottom)))] right-4 z-50 w-72 animate-fade-in-up lg:bottom-24">
          <div className="rounded-2xl border border-white/[0.06] bg-[#0e1017] shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden">
            {/* Header */}
            <div className="bg-yellow-400 px-4 py-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-black/15 flex items-center justify-center text-black">
                {cs.avatar
                  ? <img src={cs.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                  : <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-black truncate">{cs.displayName}</p>
                <p className="text-[10px] text-black/60">Online</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-black/50 hover:text-black transition-colors" aria-label="Close">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-2.5">
              <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2.5 mb-1">
                <p className="text-xs text-zinc-300 leading-relaxed">{cs.welcome}</p>
              </div>

              {cs.tgOk && (
                <a
                  href={cs.tgHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold py-3 transition-colors active:scale-[0.98]"
                >
                  <TgIcon className="h-4 w-4" /> Telegram
                </a>
              )}

              {cs.waOk && (
                <a
                  href={cs.waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold py-3 transition-colors active:scale-[0.98]"
                >
                  <WaIcon className="h-4 w-4" /> WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
