import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import LoginForm from '../components/LoginForm'
import { useI18n } from '../i18n'
import ModalOverlay from '../components/ui/ModalOverlay';
import CsWidget from '../components/ui/CsWidget';

export default function LoginPage() {
  const auth = useStore(s => s.auth)
  const login = useStore(s => s.login)
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingModal, setPendingModal] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [maintenance, setMaintenance] = useState(false)
  const [maintenanceMsg, setMaintenanceMsg] = useState('')
  const { t } = useI18n()
  const toDashboard = () => `/c/${auth?.id}/dashboard`

  useEffect(() => { const check = async () => {
    try {
      const { supabase } = await import("../utils/supabase.js");
      const { data } = await supabase.from('platform_config').select('key, value');
      if (!data) return;
      const cfg = Object.fromEntries(data.map(r => [r.key, r.value]));
      if (cfg.maintenance_mode === 'true') { setMaintenance(true); setMaintenanceMsg(cfg.maintenance_msg || ''); }
    } catch {}
  }; check(); }, []);

  useEffect(() => { if (auth) navigate(toDashboard(), { replace: true }) }, [auth, navigate])

  if (maintenance) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050607] px-6 text-center">
        <div className="text-6xl mb-6">🔧</div>
        <h1 className="text-2xl font-bold text-white mb-3">Under Maintenance</h1>
        <p className="text-zinc-400 max-w-md text-sm">{maintenanceMsg || 'Please check back later.'}</p>
      </div>
    );
  }

  const handleLogin = async e => {
    e.preventDefault()
    setError('')
    const identity = username.trim().toLowerCase()
    if (!identity || !password) { setError(t('auth.enter_credentials')); return }
    setLoading(true)
    let result
    try { result = await login(identity, password) } catch (err) {
      console.error('[NUMBER9] Login error:', err)
      setError(t('common.connection_error'))
      setLoading(false)
      return
    }
    if (!result || !result.ok) {
      if (result && result.pending) {
        setPendingModal(result.displayName || identity)
        setLoading(false)
        return
      }
      setError((result && result.error) || t('auth.login_failed'))
      setLoading(false)
      return
    }
    setLoading(false)
    navigate(toDashboard(), { replace: true })
  }

  return (
    <>
      <button
        onClick={() => navigate('/')}
        className="fixed top-4 left-4 z-20 p-2 text-zinc-400 hover:text-white transition"
        title="Back"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <LoginForm
        username={username}
        password={password}
        loading={loading}
        error={error}
        showPassword={showPassword}
        onUsernameChange={e => setUsername(e.target.value)}
        onPasswordChange={e => setPassword(e.target.value)}
        onPasswordToggle={() => setShowPassword(!showPassword)}
        onSubmit={handleLogin}
        alternateLink={{ label: t('auth.no_account'), linkText: t('auth.register_link'), href: '/register' }}
      />

      {pendingModal && (
        <ModalOverlay open={!!pendingModal} onClose={() => setPendingModal(null)} className="items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-xl border border-[#1f2128] bg-[#13151c] p-6 text-center">
            <h3 className="text-lg font-extrabold text-white">{t('auth.registration_pending')}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {t('auth.account_pending', { name: pendingModal })}
            </p>
            <button
              data-autofocus
              className="mt-5 h-10 w-full rounded-lg bg-yellow-400 text-sm font-extrabold text-black transition hover:bg-yellow-300"
              onClick={() => setPendingModal(null)}
            >
              {t('common.ok')}
            </button>
          </div>
        </ModalOverlay>
      )}
      <CsWidget />
    </>
  )
}
