// UNUSED
import { useI18n } from '../../i18n';
import { DarkCard } from './Card';

export function BalanceDisplay({ balance = 0, label, subtitle }) {
  const { t } = useI18n();
  const displayLabel = label ?? t('ui.balance_label');
  const displaySubtitle = subtitle ?? t('ui.balance_subtitle');
  return (
    <DarkCard header={displayLabel}>
      <div className="px-4 py-4">
        <p className="text-3xl font-black tabular-nums text-white">
          {balance.toLocaleString()}
          <span className="ml-1.5 text-base font-bold text-yellow-400">{t('common.points')}</span>
        </p>
        {displaySubtitle && <p className="mt-1 text-[10px] text-zinc-500">{displaySubtitle}</p>}
      </div>
    </DarkCard>
  );
}
