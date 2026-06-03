import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LOGOS, VALUES, STATS } from '../config/landing';
import { supabase } from '../utils/supabase';
import { useI18n } from '../i18n';
import CsWidget from '../components/ui/CsWidget';

export default function LandingPage() {
  const { t, lang, setLang } = useI18n();
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase.from('platform_config').select('key, value').then(({ data }) => {
      if (!data) return;
      const cfg = Object.fromEntries(data.map(r => [r.key, r.value]));
      if (cfg.maintenance_mode === 'true') {
        setMaintenance(true);
        setMaintenanceMsg(cfg.maintenance_msg || '');
      }
    }).catch(() => {});
  }, []);

  if (maintenance) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050607] px-6 text-center">
        <div className="text-6xl mb-6">🔧</div>
        <h1 className="text-2xl font-bold text-white mb-3">Under Maintenance</h1>
        <p className="text-zinc-400 max-w-md text-sm">{maintenanceMsg || 'Please check back later.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050607] text-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 border-b border-[#1f2128] bg-[#050607]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <img src="/assets/img/number9-logo.png" alt="NUMBER9" className="h-8 w-auto" />
          <div className="flex gap-3">
            <button
              onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
              className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs font-bold text-zinc-300 hover:border-yellow-400/50 hover:text-yellow-400 transition"
            >
              {lang === 'id' ? 'EN' : 'ID'}
            </button>
            <Link to="/login" className="px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 text-sm font-semibold transition">{t('nav.login')}</Link>
            <Link to="/register" className="px-4 py-2 rounded-lg bg-yellow-400 text-black text-sm font-bold hover:bg-yellow-300 transition">{t('nav.register')}</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative px-4 py-32 md:py-48" style={{ backgroundImage: 'url(/assets/img/hero-globe.png)', backgroundPosition: 'center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundAttachment: 'fixed' }}>
        <div className="absolute inset-0 bg-gradient-to-b from-[#050607]/40 to-[#050607]/90" />

        <div className="mx-auto max-w-4xl text-center relative z-10">
          <p className="text-sm font-black tracking-widest text-yellow-400 mb-4 uppercase">{t('landing.hero_badge')}</p>
          <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
            <div>{t('landing.hero_headline_1')}</div>
            <div>{t('landing.hero_headline_2')}</div>
          </h1>
          <div className="space-y-4 mb-8">
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">{t('landing.hero_body_1')}</p>
            <p className="text-lg text-zinc-400 max-w-2xl mx-auto">{t('landing.hero_body_2')}</p>
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

      {/* Partners Section */}
      <section className="px-4 py-20 md:py-32 bg-[#0c0e14] border-t border-[#1f2128]">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-black mb-12 text-center">{t('landing.trusted_by')}</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-6 items-center justify-items-center">
            {LOGOS.map((logo, i) => (
              <img key={i} src={logo.src} alt={logo.alt} className="h-12 w-auto opacity-70 hover:opacity-100 transition" />
            ))}
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="px-4 py-20 md:py-32 border-t border-[#1f2128]">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl font-black mb-16 text-center">{t('landing.values_title')}</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {VALUES.map((value, i) => {
              const labels = [t('landing.value_integrity'), t('landing.value_collaboration'), t('landing.value_innovation'), t('landing.value_excellence')];
              const descs = [t('landing.value_integrity_desc'), t('landing.value_collaboration_desc'), t('landing.value_innovation_desc'), t('landing.value_excellence_desc')];
              return (
              <div key={i} className="rounded-xl border border-[#1f2128] bg-[#0c0e14] p-6 text-center">
                <img src={value.icon} alt={labels[i]} className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">{labels[i]}</h3>
                <p className="text-zinc-400 text-sm">{descs[i]}</p>
              </div>
            )})}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="px-4 py-20 md:py-32 border-t border-[#1f2128]">
        <div className="mx-auto max-w-6xl">
          <div className="grid md:grid-cols-4 gap-8">
            {STATS.map((stat, i) => {
              const labels = [t('landing.stat_countries'), t('landing.stat_partners'), t('landing.stat_experience'), t('landing.stat_opportunities')];
              const values = [t('landing.stat_countries_val'), t('landing.stat_partners_val'), t('landing.stat_experience_val'), t('landing.stat_opportunities_val')];
              return (
              <div key={i} className="text-center">
                <img src={stat.icon} alt={labels[i]} className="h-16 w-16 mx-auto mb-4 opacity-80" />
                <div className="text-4xl font-black text-yellow-400 mb-2">{values[i]}</div>
                <p className="text-zinc-400">{labels[i]}</p>
              </div>
            )})}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="px-4 py-20 md:py-32 bg-[#0c0e14] border-t border-[#1f2128]">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-black tracking-widest text-yellow-400 mb-4 uppercase">{t('landing.about_badge')}</p>
          <h2 className="text-5xl font-black mb-8 leading-tight">
            <div>{t('landing.about_headline_1')}</div>
            <div>{t('landing.about_headline_2')}</div>
            <div>{t('landing.about_headline_3')}</div>
          </h2>
          <div className="space-y-6">
            <p className="text-lg text-zinc-400">{t('landing.about_body_1')}</p>
            <p className="text-lg text-zinc-400">{t('landing.about_body_2')}</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-20 md:py-32 border-t border-[#1f2128]">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-black mb-6">{t('landing.cta_title')}</h2>
          <Link to="/register" className="inline-block px-10 py-4 rounded-lg bg-yellow-400 text-black font-bold text-lg hover:bg-yellow-300 transition">
            {t('landing.cta_button')}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-12 border-t border-[#1f2128] text-center text-sm text-zinc-500">
        <p>{t('landing.footer')}</p>
      </footer>
      <CsWidget />
    </div>
  );
}
