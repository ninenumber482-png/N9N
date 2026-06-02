import { useI18n } from '../../i18n';

export function EmptyState({ icon = "📋", text, subtitle = "", className = "" }) {
  const { t } = useI18n();
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-8 text-center ${className}`}>
      <span className="text-4xl opacity-40">{icon}</span>
      <p className="text-[11px] font-medium text-zinc-400">{text ?? t('ui.empty_default')}</p>
      {subtitle && <p className="text-[10px] text-zinc-500">{subtitle}</p>}
    </div>
  );
}

export function ActionRequired({ icon = "🔔", title, subtitle = "", actionLabel, onAction = () => {}, className = "" }) {
  const { t } = useI18n();
  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-yellow-400/20 bg-yellow-400/5 py-8 text-center ${className}`}>
      <span className="text-4xl">{icon}</span>
      <div>
        <p className="text-[12px] font-bold text-yellow-400">{title ?? t('ui.empty_action_title')}</p>
        {subtitle && <p className="mt-1 text-[10px] text-zinc-500">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={onAction}
        className="mt-2 inline-flex h-8 items-center rounded-lg bg-yellow-400 px-4 text-[11px] font-bold text-black transition hover:bg-yellow-300 active:scale-95"
      >
        {actionLabel ?? t('ui.empty_action_label')}
      </button>
    </div>
  );
}

export function LoadingState({ message, className = "" }) {
  const { t } = useI18n();
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-8 text-center ${className}`}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1f2128] border-t-yellow-400" />
      <p className="text-[11px] text-zinc-500">{message ?? t('ui.loading')}</p>
    </div>
  );
}
