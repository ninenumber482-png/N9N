import { useRef } from 'react'
import { useI18n } from '../../i18n'
import { useModal } from '../../hooks/useModal'

export default function ConfirmDialog({
  open, title, message, onConfirm, onCancel, loading,
  confirmText, cancelText, showLogo,
}) {
  const { t } = useI18n()
  const containerRef = useRef(null)
  const modal = useModal({ open, onClose: onCancel, containerRef })

  if (!open) return null

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'confirm-title' : undefined}
      onMouseDown={modal.onMouseDown}
      onClick={modal.onClick}
    >
      <div
        className={`relative w-full max-w-[min(calc(100%-2rem),24rem)] rounded-2xl border border-white/[0.06] bg-[#0e1017] p-6 sm:p-7 text-center shadow-[0_0_60px_rgba(0,0,0,0.6)] ${loading ? 'pointer-events-none' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showLogo && (
          <div className="mb-5 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-yellow-400/10 to-yellow-500/5 ring-1 ring-yellow-400/20">
              <img
                src="/assets/img/number9-logo.png"
                alt="NUMBER9"
                className="h-11 w-auto drop-shadow-[0_0_12px_rgba(250,204,21,0.25)]"
              />
            </div>
          </div>
        )}

        {title && (
          <h3 id="confirm-title" className="text-lg font-extrabold tracking-tight text-white">{title}</h3>
        )}

        {message && (
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{message}</p>
        )}

        <div className="mt-7 flex items-center gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 h-12 rounded-xl border border-white/8 bg-white/[0.03] text-sm font-bold text-zinc-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-white transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {cancelText || t('common.cancel')}
          </button>
          <button
            data-autofocus
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-12 rounded-xl bg-linear-to-b from-yellow-400 to-yellow-500 text-sm font-extrabold text-black shadow-[0_0_20px_rgba(250,204,21,0.15)] hover:from-yellow-300 hover:to-yellow-400 hover:shadow-[0_0_30px_rgba(250,204,21,0.25)] transition-all active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2.5">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('common.loading')}
              </span>
            ) : (
              confirmText || t('common.yes')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
