import { Link } from 'react-router-dom';
import { Icon } from './icons';
import { useI18n } from '../i18n';
import { useState } from 'react';
import { getCsConfig } from '../utils/csConfigCache';

export default function LoginForm({
  username,
  password,
  loading,
  error,
  showPassword,
  onUsernameChange,
  onPasswordChange,
  onPasswordToggle,
  onSubmit,
  alternateLink,
}) {
  const { t } = useI18n();
  const hasError = !!error;
  const isDisabled = loading || !username || !password;

  const [csHref] = useState(() => {
    try {
      const cfg = getCsConfig();
      if (cfg?.cs_active === 'true' && cfg.cs_wa_number) {
        const wa = cfg.cs_wa_number.replace(/[^\d]/g, '');
        const msg = encodeURIComponent(cfg.cs_welcome_message || 'Hello, I need assistance.');
        return `https://wa.me/${wa}?text=${msg}`;
      }
    } catch { /* ignore */ }
    return null;
  });

  return (
    <div className="relative min-h-screen bg-[#050607] px-4 py-10 overflow-hidden">
      {/* Background Globe Decoration */}
      <img
        src="/assets/img/hero-globe.png"
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-full w-auto opacity-30"
        style={{ filter: 'drop-shadow(0 0 32px rgba(246,200,60,0.12))' }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-2/3"
        style={{
          background: 'linear-gradient(to right, #050607 0%, rgba(5,6,7,0.6) 50%, transparent 80%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="mb-8 text-center">
            {/* Logo */}
            <img
              src="/assets/img/number9-logo.png"
              alt="NUMBER9"
              className="mx-auto mb-4 h-8 w-auto"
            />

            {/* Gold Pill Badge */}
            <span className="inline-flex items-center rounded-full border border-[rgba(244,196,0,0.2)] bg-[rgba(7,8,9,0.6)] px-3 py-1 text-[10px] font-semibold tracking-widest text-[#e8c84a]">
              {t('auth.member_secure_access')}
            </span>
          </div>

          {/* Card */}
          <div className="rounded-xl border border-[#1f2128] bg-[#0c0e14] p-6">
            <h2 className="text-xl font-bold text-white">{t('auth.sign_in')}</h2>

            {/* Error Banner */}
            {hasError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-yellow-400/30 bg-[#1a1810] px-3 py-2.5">
                <span className="mt-0.5 text-yellow-400">
                  <Icon.Warn size={14} />
                </span>
                <p className="text-[12px] leading-relaxed text-yellow-200">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {/* Username */}
              <div>
                <label
                  htmlFor="login-user"
                  className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-400"
                >
                  {t('auth.username')}
                </label>
                <input
                  id="login-user"
                  type="text"
                  className="h-10 w-full rounded-lg border border-[#1f2128] bg-[#0e1117] px-3 text-base sm:text-sm text-white outline-none placeholder:text-zinc-500 transition focus:border-yellow-400/70 disabled:cursor-not-allowed disabled:opacity-50"
                  value={username}
                  onChange={onUsernameChange}
                  placeholder={t('auth.username_placeholder')}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="login-pass"
                  className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-400"
                >
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <input
                    id="login-pass"
                    type={showPassword ? 'text' : 'password'}
                    className="h-10 w-full rounded-lg border border-[#1f2128] bg-[#0e1117] px-3 text-base sm:text-sm text-white outline-none placeholder:text-zinc-500 transition focus:border-yellow-400/70 disabled:cursor-not-allowed disabled:opacity-50"
                    value={password}
                    onChange={onPasswordChange}
                    placeholder={t('auth.password_placeholder')}
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={onPasswordToggle}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition hover:text-yellow-400"
                    tabIndex="-1"
                  >
                    {showPassword ? <Icon.Eye size={16} /> : <Icon.EyeOff size={16} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isDisabled}
                className="h-11 w-full rounded-lg bg-yellow-400 text-sm font-extrabold text-black transition hover:bg-yellow-300 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? t('auth.signing_in') : t('auth.sign_in')}
              </button>
            </form>

            {/* Alternate Link (Register) */}
            {alternateLink && (
              <p className="mt-4 text-center text-[12px] text-zinc-500">
                {alternateLink.label}{' '}
                <Link
                  to={alternateLink.href}
                  className="font-semibold text-yellow-400 hover:text-yellow-300"
                >
                  {alternateLink.linkText}
                </Link>
              </p>
            )}
            {csHref && (
              <p className="mt-3 text-center text-[11px] text-zinc-600">
                <a
                  href={csHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-yellow-400/80 hover:text-yellow-400 transition"
                >
                  <Icon.Chat size={12} />
                  {t('auth.contact_support')}
                </a>
              </p>
            )}
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-[11px] text-[#444]">
            {t('landing.footer')}
          </p>
        </div>
      </div>
    </div>
  );
}
