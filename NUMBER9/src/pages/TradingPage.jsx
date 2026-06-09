import { useEffect, useState } from 'react'
import { Icon } from '../components/icons'
import PageShell from '../components/ui/PageShell'
import SectionHead from '../components/ui/SectionHead'
import Spinner from '../components/ui/Spinner'
import { useI18n } from '../i18n'
import { useParams } from 'react-router-dom'
import { apiInvoke } from '../utils/api'

const FETCH_INTERVAL = 3600_000

export default function TradingPage() {
  const { t } = useI18n()
  const { clientUuid } = useParams()
  const p = (path) => `/c/${clientUuid}${path}`
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tickerIdx, setTickerIdx] = useState(0)

  useEffect(() => {
    let mounted = true
    const fetchNews = () => {
      apiInvoke('fetch-news', {}).then((data) => {
        if (!mounted) return
        if (data?.ok && Array.isArray(data.articles)) {
          setArticles(data.articles)
          setError(null)
        } else {
          setError('Gagal memuat berita')
        }
      }).catch((e) => {
        if (mounted) setError(e?.message || 'Gagal memuat berita')
      }).finally(() => {
        if (mounted) setLoading(false)
      })
    }
    fetchNews()
    const interval = setInterval(fetchNews, FETCH_INTERVAL)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (articles.length === 0) return
    const timer = setInterval(() => {
      setTickerIdx((prev) => (prev + 1) % articles.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [articles.length])

  const featured = articles.slice(0, 1)
  const rest = articles.slice(1, 13)
  const tickerArticle = articles[tickerIdx]

  const formatDate = (d) => {
    if (!d) return ''
    const date = new Date(d)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    if (diff < 3600_000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}j`
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  }

  const strip = (str) => {
    if (!str) return ''
    return str.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
  }

  return (
    <PageShell
      title={t('media.title')}
      subtitle={t('media.subtitle')}
      back={{ to: p('/dashboard'), label: t('common.back') }}
    >
      {/* NEWS TICKER */}
      {tickerArticle && (
        <div className="overflow-hidden rounded-lg sm:rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          <a
            href={tickerArticle.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-white/5 transition"
          >
            <span className="shrink-0 rounded bg-yellow-400/15 px-1 py-0.5 text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-yellow-400">Live</span>
            <span className="animate-marquee whitespace-nowrap text-[10px] sm:text-[11px] font-semibold text-white">
              {strip(tickerArticle.title)}
            </span>
            <span className="shrink-0 text-[8px] sm:text-[9px] text-zinc-500 ml-auto">{formatDate(tickerArticle.date)}</span>
          </a>
        </div>
      )}

      {/* HEADLINE */}
      {loading ? (
        <div className="flex justify-center py-6 sm:py-8"><Spinner size="sm" /></div>
      ) : error ? (
        <div className="rounded-lg sm:rounded-xl border border-red-400/20 bg-red-400/5 px-3 sm:px-4 py-2.5 sm:py-3 text-[11px] sm:text-xs text-red-400">{error}</div>
      ) : featured.length > 0 ? (
        <a
          href={featured[0].link}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block overflow-hidden rounded-lg sm:rounded-xl border border-[#1f2128] bg-[#0c0e14] hover:border-yellow-400/30 transition"
        >
          <div className="aspect-[4/3] sm:aspect-[3/1] bg-gradient-to-br from-yellow-400/5 via-zinc-800/50 to-[#0c0e14] p-3 sm:p-6 flex flex-col justify-end">
            <span className="inline-flex self-start rounded bg-yellow-400/15 px-1.5 sm:px-2 py-0.5 text-[7px] sm:text-[9px] font-black uppercase tracking-widest text-yellow-400 mb-1.5 sm:mb-2">
              {t('media.latest_news')}
            </span>
            <h2 className="text-xs sm:text-lg font-black text-white leading-snug line-clamp-2 group-hover:text-yellow-400 transition">
              {strip(featured[0].title)}
            </h2>
            <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-[11px] text-zinc-400 line-clamp-1 sm:line-clamp-2">{strip(featured[0].excerpt)}</p>
            <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2 text-[9px] sm:text-[10px] text-zinc-500">
              <span>{featured[0].source || 'News'}</span>
              <span>·</span>
              <span>{formatDate(featured[0].date)}</span>
            </div>
          </div>
        </a>
      ) : null}

      {/* NEWS GRID */}
      <section>
        <SectionHead>{t('media.tab_news')}</SectionHead>
        {loading ? (
          <div className="flex justify-center py-6 sm:py-8"><Spinner size="sm" /></div>
        ) : rest.length === 0 ? (
          <div className="rounded-lg sm:rounded-xl border border-[#1f2128] bg-[#0c0e14] px-4 py-5 sm:py-6 text-center text-[11px] sm:text-xs text-zinc-500">
            {t('media.no_news')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {rest.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-lg sm:rounded-xl border border-[#1f2128] bg-[#0c0e14] px-2.5 sm:px-3 py-2.5 sm:py-3 hover:border-yellow-400/30 hover:bg-white/[0.02] transition"
              >
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="mt-0.5 grid h-6 w-6 sm:h-7 sm:w-7 shrink-0 place-items-center rounded-lg bg-yellow-400/10 text-yellow-400">
                    <Icon.Bell size={9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] sm:text-[12px] font-bold text-white leading-snug line-clamp-2 group-hover:text-yellow-400 transition">{strip(item.title)}</p>
                    <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] text-zinc-400 line-clamp-1 sm:line-clamp-2">{strip(item.excerpt)}</p>
                    <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-1.5 text-[8px] sm:text-[9px] text-zinc-500">
                      <span className="truncate">{item.source || 'News'}</span>
                      <span>·</span>
                      <span className="shrink-0">{formatDate(item.date)}</span>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* MEDIA GALLERY */}
      <section>
        <SectionHead>{t('media.tab_gallery')}</SectionHead>
        <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-3">
          {[
            { icon: Icon.Trade, title: t('media.cat_gold'), desc: 'Analisa pergerakan harga emas global', color: 'from-yellow-400/20 via-yellow-400/5' },
            { icon: Icon.Trade, title: t('media.cat_forex'), desc: 'Update nilai tukar dan komoditas', color: 'from-emerald-400/20 via-emerald-400/5' },
            { icon: Icon.FileText, title: t('media.cat_press'), desc: 'Siaran resmi NUMBER9 terbaru', color: 'from-sky-400/20 via-sky-400/5' },
          ].map((m, i) => (
            <div key={i} className="group overflow-hidden rounded-lg sm:rounded-xl border border-[#1f2128] bg-[#0c0e14] hover:border-yellow-400/30 transition">
              <div className={`flex aspect-[3/2] sm:aspect-[16/9] items-center justify-center bg-gradient-to-br ${m.color} to-transparent p-3 sm:p-4`}>
                <m.icon size={32} className="text-zinc-600 group-hover:text-yellow-400 transition" />
              </div>
              <div className="border-t border-[#1f2128] px-2.5 sm:px-3 py-2 sm:py-2.5">
                <p className="text-[11px] sm:text-[12px] font-bold text-white">{m.title}</p>
                <p className="text-[9px] sm:text-[10px] text-zinc-500 mt-px sm:mt-0.5">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* INFO CARDS */}
      <section>
        <SectionHead>{t('media.tab_platform')}</SectionHead>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: t('media.support_available'), value: t('media.live_chat'), icon: Icon.Chat },
            { label: t('media.processing_time'), value: t('media.instant_deposit'), icon: Icon.Clock },
            { label: t('media.security'), value: t('media.ssl_2fa'), icon: Icon.Security },
            { label: t('media.demo_account'), value: t('media.demo_available'), icon: Icon.User },
          ].map((c, i) => (
            <div key={i} className="flex items-center gap-2 sm:gap-3 rounded-lg sm:rounded-xl border border-[#1f2128] bg-[#0c0e14] px-2.5 sm:px-3 py-2 sm:py-2.5">
              <span className="grid h-7 w-7 sm:h-8 sm:w-8 shrink-0 place-items-center rounded-lg bg-yellow-400/10 text-yellow-400">
                <c.icon size={12} />
              </span>
              <div>
                <p className="text-[9px] sm:text-[10px] font-bold text-zinc-500">{c.label}</p>
                <p className="text-[11px] sm:text-[12px] font-extrabold text-white">{c.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="rounded-lg sm:rounded-xl border border-[#1f2128] bg-[#0c0e14] px-2.5 sm:px-3 py-2 sm:py-2.5 lg:px-4">
        <div className="flex items-start gap-1.5 sm:gap-2">
          <Icon.Info size={12} className="mt-0.5 shrink-0 text-zinc-500" />
          <p className="text-[9px] sm:text-[10px] leading-relaxed text-zinc-600">{t('media.disclaimer')}</p>
        </div>
      </section>
    </PageShell>
  )
}
