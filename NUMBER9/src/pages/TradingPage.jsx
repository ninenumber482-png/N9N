import { Icon } from '../components/icons'
import PageShell from '../components/ui/PageShell'
import SectionHead from '../components/ui/SectionHead'
import { useI18n } from '../i18n'
import { useParams } from 'react-router-dom'

export default function TradingPage() {
  const { t } = useI18n()
  const { clientUuid } = useParams()
  const p = (path) => `/c/${clientUuid}${path}`

  const NEWS = [
    { date: t('media.news_1_date'), title: t('media.news_1_title'), excerpt: t('media.news_1_body') },
    { date: t('media.news_2_date'), title: t('media.news_2_title'), excerpt: t('media.news_2_body') },
    { date: t('media.news_3_date'), title: t('media.news_3_title'), excerpt: t('media.news_3_body') },
    { date: t('media.news_4_date'), title: t('media.news_4_title'), excerpt: t('media.news_4_body') },
    { date: t('media.news_5_date'), title: t('media.news_5_title'), excerpt: t('media.news_5_body') },
    { date: t('media.news_6_date'), title: t('media.news_6_title'), excerpt: t('media.news_6_body') },
  ]

  const MEDIA = [
    { icon: Icon.Trade, title: t('media.cat_gold'), desc: 'Analisa pergerakan harga emas global' },
    { icon: Icon.Trade, title: t('media.cat_forex'), desc: 'Update nilai tukar dan komoditas' },
    { icon: Icon.FileText, title: t('media.cat_press'), desc: 'Siaran resmi NUMBER9 terbaru' },
  ]
  return (
    <PageShell
      title={t('media.title')}
      subtitle={t('media.subtitle')}
      back={{ to: p('/dashboard'), label: t('common.back') }}
    >
      {/* NEWS FEED */}
      <section>
        <SectionHead>{t('media.tab_news')}</SectionHead>
        <div className="divide-y divide-[#1f2128] rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          {NEWS.map((item, i) => (
            <article key={i} className="px-3 py-2.5 lg:px-4 lg:py-3">
              <div className="flex items-start gap-3">
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-yellow-400/10 text-yellow-400">
                  <Icon.Bell size={12} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-extrabold text-white leading-snug">{item.title}</p>
                    <span className="shrink-0 text-[9px] font-bold text-zinc-500">{item.date}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">{item.excerpt}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* MEDIA GALLERY */}
      <section>
        <SectionHead>{t('media.tab_gallery')}</SectionHead>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MEDIA.map((m, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-[#1f2128] bg-[#0c0e14]">
              <div className="flex aspect-[16/9] items-center justify-center bg-[#13151c] p-4">
                <m.icon size={48} className="text-zinc-700" />
              </div>
              <div className="border-t border-[#1f2128] px-3 py-2">
                <p className="text-[11px] font-bold text-white">{m.title}</p>
                <p className="text-[9px] text-zinc-500">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* INFO CARDS */}
      <section>
        <SectionHead>{t('media.tab_platform')}</SectionHead>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: t('media.support_available'), value: t('media.live_chat'), icon: Icon.Chat },
            { label: t('media.processing_time'), value: t('media.instant_deposit'), icon: Icon.Clock },
            { label: t('media.security'), value: t('media.ssl_2fa'), icon: Icon.Security },
            { label: t('media.demo_account'), value: t('media.demo_available'), icon: Icon.User },
          ].map((c, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-[#1f2128] bg-[#0c0e14] px-3 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-yellow-400/10 text-yellow-400">
                <c.icon size={14} />
              </span>
              <div>
                <p className="text-[10px] font-bold text-zinc-500">{c.label}</p>
                <p className="text-[12px] font-extrabold text-white">{c.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* DISCLAIMER */}
      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14] px-3 py-2.5 lg:px-4">
        <div className="flex items-start gap-2">
          <Icon.Info size={14} className="mt-0.5 shrink-0 text-zinc-500" />
          <p className="text-[10px] leading-relaxed text-zinc-600">
            {t('media.disclaimer')}
          </p>
        </div>
      </section>
    </PageShell>
  )
}
