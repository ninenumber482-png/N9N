import { Link } from 'react-router-dom';
import { TRUST, VALUES, STATS } from '../config/landing';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n';
import MaintenancePage from './MaintenancePage';

// Neutral inline SVG icons (heroicons outline paths) — used by trust badges,
// values, and stats so the whole landing uses crisp icons (no pasted PNGs).
const ICONS = {
  licensed: 'M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z',
  secure: 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z',
  encrypted: 'M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z',
  payout: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z',
  support: 'M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z',
  fair: 'M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z',
  // values
  integrity: 'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.572-.598-3.751h-.152c-3.196 0-6.1-1.25-8.25-3.285Z',
  collaboration: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
  innovation: 'M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
  excellence: 'M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z',
  // stats
  countries: 'M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418',
  partners: 'M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z',
  years: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  opportunities: 'M2.25 18 9 11.25l4.306 4.307a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.28m5.94 2.28-2.28 5.941',
};

export default function LandingPage() {
  const { t, lang, setLang } = useI18n();
  const systemStatus = useStore(s => s.systemStatus);

  if (systemStatus?.platformMaintenance) {
    return <MaintenancePage message={systemStatus?.platformMsg} />;
  }

  return (
    <div className="min-h-screen bg-[#050607] text-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 border-b border-[#1f2128] bg-[#050607]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <img src="/assets/img/number9-logo.png" alt="NUMBER9" className="h-8 w-auto shrink-0" />
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
              aria-label={lang === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg border border-zinc-700 text-[10px] font-bold text-zinc-300 hover:border-yellow-400/50 hover:text-yellow-400 transition shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
              {lang === 'id' ? 'EN' : 'ID'}
            </button>
            <Link to="/login" className="px-3 sm:px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 text-sm font-semibold whitespace-nowrap shrink-0 transition">{t('nav.login')}</Link>
            <Link to="/register" className="px-3 sm:px-4 py-2 rounded-lg bg-yellow-400 text-black text-sm font-bold whitespace-nowrap shrink-0 hover:bg-yellow-300 transition">{t('nav.register')}</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-4 py-32 md:py-48" style={{ backgroundImage: 'url(/assets/img/hero-globe.webp)', backgroundPosition: 'center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat' }}>
        <div className="absolute inset-0 bg-linear-to-b from-[#050607]/40 to-[#050607]/90" />

        <div className="mx-auto max-w-4xl text-center relative z-10">
          <p className="text-sm font-black tracking-widest text-yellow-400 mb-4 uppercase">{t('landing.hero_badge')}</p>
          <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black mb-6 leading-tight">
            <div>{t('landing.hero_headline_1')}</div>
            <div>{t('landing.hero_headline_2')}</div>
          </h1>
          <div className="space-y-4 mb-8">
            <p className="text-lg text-zinc-300 max-w-2xl mx-auto">{t('landing.hero_body_1')}</p>
            <p className="text-lg text-zinc-300 max-w-2xl mx-auto">{t('landing.hero_body_2')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="px-8 py-3 rounded-lg bg-yellow-400 text-black font-bold hover:bg-yellow-300 transition">
              {t('landing.hero_cta_primary')}
            </Link>
            <a href="#about" className="px-8 py-3 rounded-lg border border-white/20 font-semibold hover:border-white/40 transition">
              {t('landing.hero_cta_secondary')}
            </a>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="px-4 py-20 md:py-32 bg-[#0c0e14] border-t border-[#1f2128]">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-xl sm:text-2xl font-black mb-12 text-center">{t('landing.trusted_by')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-10 items-start justify-items-center">
            {TRUST.map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#1f2128] bg-[#11141c] text-yellow-400">
                  <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[item.icon]} />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-zinc-300">{t(item.labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="px-4 py-20 md:py-32 border-t border-[#1f2128]">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl sm:text-4xl font-black mb-10 sm:mb-16 text-center">{t('landing.values_title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {VALUES.map((value, i) => {
              const title = t(value.titleKey);
              const desc = t(value.descKey);
              return (
              <div key={i} className="flex h-full flex-col items-center rounded-xl border border-[#1f2128] bg-[#0c0e14] p-6 text-center transition duration-300 hover:border-yellow-400/30 hover:bg-[#11141c]">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[value.icon]} />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-2">{title}</h3>
                <p className="text-zinc-400 text-sm">{desc}</p>
              </div>
            )})}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="px-4 py-20 md:py-32 border-t border-[#1f2128]">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {STATS.map((stat, i) => {
              const label = t(stat.labelKey);
              return (
              <div key={i} className="text-center">
                <div className="mx-auto mb-3 sm:mb-4 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-400">
                  <svg className="h-6 w-6 sm:h-8 sm:w-8" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[stat.icon]} />
                  </svg>
                </div>
                <div className="text-3xl sm:text-4xl font-black text-yellow-400 mb-2">{stat.value}</div>
                <p className="text-zinc-400">{label}</p>
              </div>
            )})}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="px-4 py-20 md:py-32 bg-[#0c0e14] border-t border-[#1f2128]">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-black tracking-widest text-yellow-400 mb-4 uppercase">{t('landing.about_badge')}</p>
          <h2 className="text-3xl sm:text-5xl font-black mb-8 leading-tight">
            <div>{t('landing.about_headline_1')}</div>
            <div>{t('landing.about_headline_2')}</div>
            <div>{t('landing.about_headline_3')}</div>
          </h2>
          <div className="space-y-6">
            <p className="text-lg text-zinc-300">{t('landing.about_body_1')}</p>
            <p className="text-lg text-zinc-300">{t('landing.about_body_2')}</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-20 md:py-32 border-t border-[#1f2128]">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl sm:text-4xl font-black mb-6">{t('landing.cta_title')}</h2>
          <Link to="/register" className="inline-block px-10 py-4 rounded-lg bg-yellow-400 text-black font-bold text-lg hover:bg-yellow-300 transition">
            {t('landing.cta_button')}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-12 border-t border-[#1f2128] text-center text-sm text-zinc-500">
        <p>{t('landing.footer')}</p>
      </footer>
    </div>
  );
}
