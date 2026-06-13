import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import LoginForm from '../components/LoginForm'
import { useI18n } from '../i18n'
import ModalOverlay from '../components/ui/ModalOverlay';
import MaintenancePage from './MaintenancePage';

export default function LoginPage() {
  const auth = useStore(s => s.auth)
  const login = useStore(s => s.login)
  const systemStatus = useStore(s => s.systemStatus)
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingModal, setPendingModal] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const { t } = useI18n()
  const toDashboard = () => `/c/${auth?.id}/dashboard`

  useEffect(() => { if (auth?.id) navigate(toDashboard(), { replace: true }) }, [auth, navigate, toDashboard])

  if (systemStatus?.platformMaintenance) {
    return <MaintenancePage message={systemStatus?.platformMsg} />;
  }

  const handleLogin = async e => {
    e.preventDefault()
    setError('')
    const identity = username.trim().toLowerCase()
    if (!identity || !password) { setError(t('auth.enter_credentials')); return }
    setLoading(true)
    let result
    try { result = await login(identity, password) } catch {
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
        <ModalOverlay open={!!pendingModal} onClose={() => setPendingModal(null)} className="items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-[#0e1017] p-6 text-center">
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
    </>
  )
}
