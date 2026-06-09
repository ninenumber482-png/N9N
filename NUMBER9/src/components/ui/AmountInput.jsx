import { useI18n } from '../../i18n';
import { DarkCard } from './Card';
import { formatIDR } from '../../utils/format';

export function AmountInput({
  value = '',
  onChange = () => {},
  presets = [100, 500, 1000, 5000],
  onMaxClick = null,
  error = null,
  placeholder,
  label,
  showMax = false,
  showIDR = true,
}) {
  const { t } = useI18n();
  const formatPreset = (p) => p >= 1000 ? `${p / 1000}K` : p;
  const displayPlaceholder = placeholder ?? t('ui.amount_placeholder');
  const numValue = Number(value || 0);

  const content = (
    <>
      <div className={`flex items-center gap-2 rounded-lg border bg-[#13151c] px-4 py-3 transition ${value && numValue > 0 ? 'border-yellow-400/30' : 'border-[#1f2128]'}`}>
        <input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={displayPlaceholder}
          className="w-full bg-transparent text-2xl font-black text-white outline-none placeholder:text-zinc-700"
        />
        <span className="text-base font-extrabold text-yellow-400">{t('common.points')}</span>
      </div>
      {showIDR && numValue > 0 && (
        <p className="mt-1.5 text-[11px] text-zinc-500">≈ {formatIDR(numValue)}</p>
      )}
      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
      <div className={`mt-2 grid gap-2 ${showMax ? 'grid-cols-5' : 'grid-cols-5'}`}>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(String(p))}
            className={`rounded-lg border py-2 text-[11px] font-bold transition ${
              value === String(p)
                ? 'border-yellow-400/40 bg-yellow-400/10 text-yellow-400'
                : 'border-[#1f2128] bg-[#0c0e14] text-zinc-500 hover:border-yellow-400/20 hover:text-white'
            }`}
          >
            <span className="block">{formatPreset(p)} P</span>
            {showIDR && <span className="block text-[9px] text-zinc-500 mt-0.5">{formatIDR(p)}</span>}
          </button>
        ))}
        {showMax && onMaxClick && (
          <button
            type="button"
            onClick={onMaxClick}
            className="rounded-lg border border-[#1f2128] bg-[#0c0e14] py-2 text-[11px] font-bold text-yellow-400 transition hover:border-yellow-400/20 hover:text-white"
          >
            {t('ui.max')}
          </button>
        )}
      </div>
    </>
  );

  // If no label passed, render bare (used inside section cards that have their own header)
  if (!label) return <div>{content}</div>;

  // With label: wrap in DarkCard as standalone widget
  return (
    <DarkCard header={label}>
      <div className="px-4 py-3">{content}</div>
    </DarkCard>
  );
}
