import { useState, useEffect } from "react";
import { useStore } from "../store/useStore";
import { requestWithdraw, fetchUserBank, fetchTurnoverSummary } from "../store/wallet";
import { Icon } from "../components/icons";
import { useNavigate, useParams } from "react-router-dom";
import { AmountInput } from "../components/ui/AmountInput";
import Spinner from "../components/ui/Spinner";
import Toast from "../components/ui/Toast";
import PageShell from "../components/ui/PageShell";
import useAlive from "../hooks/useAlive";
import { withTimeout } from "../utils/asyncHelpers";
import { WITHDRAWAL_METHODS, WITHDRAW_PRESETS } from "../constants";
import { useI18n } from '../i18n';
import ConfirmDialog from '../components/ui/ConfirmDialog';

export default function WithdrawPage() {
  const auth = useStore((s) => s.auth);
  const availableBalance = useStore((s) => s.availableBalance);
  const navigate = useNavigate();
  const { clientUuid } = useParams();
  const p = (path) => `/c/${clientUuid}${path}`;
  const { t } = useI18n();
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [bank, setBank] = useState({ bankName: '', bankAccountNumber: '', bankAccountName: '' });
  const [editBank, setEditBank] = useState({ name: '', number: '', holder: '' });
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [turnoverData, setTurnoverData] = useState({ remaining: 0, isUnlocked: true });

  const main = availableBalance ?? 0;
  const aliveRef = useAlive();

  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => { if (!auth?.username) navigate("/login"); }, [auth?.username, navigate]);

  const _rtTick = useStore((s) => s._rtTick);
  useEffect(() => {
    if (!auth?.id) return;
    setDataLoading(true);
    const p1 = fetchUserBank(auth.id).then(r => { if (aliveRef.current) setBank(r); }).catch(() => { if (aliveRef.current) setToast({ type: 'err', text: 'Failed to load bank info' }); });
    const p2 = fetchTurnoverSummary(auth.id).then(r => { if (aliveRef.current) setTurnoverData(r); }).catch(() => { if (aliveRef.current) setToast({ type: 'err', text: 'Failed to load turnover' }); });
    Promise.allSettled([p1, p2]).finally(() => { if (aliveRef.current) setDataLoading(false); });
  }, [auth?.id, _rtTick]);

  if (!auth?.username) return null;

  const bankName = bank.bankName;
  const bankAccNum = bank.bankAccountNumber;
  const bankAccName = bank.bankAccountName;
  const hasActiveTurnover = !turnoverData.isUnlocked;
  const remainingTurnover = turnoverData.remaining;
  const sel = WITHDRAWAL_METHODS.find((m) => m.key === method);
  const showBank = method === "BANK_TRANSFER";
  const hasBankData = !!(bankName && bankAccNum && bankAccName);
  const useEdit = !hasBankData || isEditingBank;
  const finalBankName = useEdit ? (editBank.name || '') : bankName;
  const finalBankAccNum = useEdit ? (editBank.number || '') : bankAccNum;
  const finalBankAccName = useEdit ? (editBank.holder || '') : bankAccName;
  const hasFinalBank = !!(finalBankName && finalBankAccNum && finalBankAccName);

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return setToast({ type: "err", text: t('withdraw.enter_valid') });
    if (amt > main) return setToast({ type: "err", text: t('withdraw.insufficient') });
    if (showBank && !hasFinalBank) return setToast({ type: "err", text: t('withdraw.add_bank') });
    if (hasActiveTurnover) return setToast({ type: "err", text: t('withdraw.turnover_required', { amount: remainingTurnover.toLocaleString() }) });
    setLoading(true);
    try {
      const r = await withTimeout(
        requestWithdraw({
          username: auth.username, userUuid: auth.id, amount: amt, method: sel?.label || method,
          bankName: showBank ? finalBankName : "", bankAccountNumber: showBank ? finalBankAccNum : "", bankAccountName: showBank ? finalBankAccName : "",
        }),
        10000
      );
      setLoading(false);
      if (!r?.ok) return setToast({ type: "err", text: r?.error || t('withdraw.withdraw_failed') });
      setToast({ type: "ok", text: t('withdraw.submitted') });
      setAmount("");
    } catch (err) {
      console.error('[NUMBER9] Withdraw submit error:', err);
      setLoading(false);
      setToast({ type: "err", text: t('common.network_error') });
    }
  };

  return (
    <PageShell
      title={t('withdraw.title')}
      subtitle={t('withdraw.subtitle')}
      back={{ to: p('/dashboard'), label: t('common.back') }}
      actions={
        <div className="hidden text-right sm:block">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('withdraw.available')}</p>
          <p className="font-mono text-2xl font-black text-yellow-400">{main.toLocaleString()} {t('common.points')}</p>
        </div>
      }
    >

      {/* TURNOVER BANNER (full width alert) */}
      {hasActiveTurnover && (
        <div className="mt-5 space-y-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-4">
          <p className="text-xs font-bold text-yellow-400">{t('withdraw.turnover_title')}</p>
          <p className="text-sm text-yellow-300">{t('withdraw.turnover_remaining', { amount: remainingTurnover.toLocaleString() })}</p>
          <div className="h-2 overflow-hidden rounded-full bg-[#1f2128]">
            <div className="h-full bg-yellow-400" style={{ width: `${turnoverData.required > 0 ? Math.min(100, Math.round(((turnoverData.achieved) / turnoverData.required) * 100)) : 0}%` }} />
          </div>
        </div>
      )}

      {/* TWO-COLUMN PRO LAYOUT */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">

        {/* LEFT — form */}
        <div className="space-y-6">
          {/* METHOD */}
          <section className="overflow-hidden rounded-xl border border-[#1f2128] bg-[#0c0e14]">
            <div className="border-b border-[#1f2128] px-4 py-3">
              <p className="text-sm font-semibold text-white">{t('withdraw.select_method')}</p>
              <p className="text-xs text-zinc-500">{t('withdraw.method_desc')}</p>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {WITHDRAWAL_METHODS.map((m) => {
                const active = method === m.key;
                return (
                  <button key={m.key} type="button" onClick={() => setMethod(m.key)}
                    className={`rounded-lg border p-4 text-left transition ${active ? "border-emerald-400 bg-emerald-400/10" : "border-[#1f2128] hover:border-zinc-500"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{m.label}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{t('withdraw.min_note', { note: m.note, min: m.min })}</p>
                      </div>
                      {active && <Icon.Check size={18} className="text-emerald-400" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* BANK INFO */}
          {showBank && (
            <section className="overflow-hidden rounded-xl border border-[#1f2128] bg-[#0c0e14]">
              <div className="border-b border-[#1f2128] px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{t('withdraw.destination')}</p>
                  <p className="text-xs text-zinc-500">{t('withdraw.destination_desc')}</p>
                </div>
                {!dataLoading && hasBankData && (
                  <button type="button" onClick={() => { setIsEditingBank(!isEditingBank); if (!isEditingBank) setEditBank({ name: bankName, number: bankAccNum, holder: bankAccName }); }}
                    className="text-[10px] font-bold text-yellow-400 hover:text-yellow-300">
                    {isEditingBank ? t('common.cancel') : t('common.edit')}
                  </button>
                )}
              </div>
              <div className="p-4 space-y-3">
                {dataLoading ? (
                  <Spinner size="sm" />
                ) : (<>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{t('withdraw.bank_name')}</label>
                  <input value={useEdit ? editBank.name : bankName} onChange={e => setEditBank(p => ({...p, name: e.target.value}))} readOnly={!useEdit}
                    className="w-full rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50 read-only:opacity-70"
                    placeholder={t('withdraw.bank_name_placeholder') || "e.g. BCA"} />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{t('withdraw.account_number')}</label>
                  <input value={useEdit ? editBank.number : bankAccNum} onChange={e => setEditBank(p => ({...p, number: e.target.value}))} readOnly={!useEdit}
                    className="w-full rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50 read-only:opacity-70"
                    placeholder="e.g. 1234567890" inputMode="numeric" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{t('withdraw.account_holder')}</label>
                  <input value={useEdit ? editBank.holder : bankAccName} onChange={e => setEditBank(p => ({...p, holder: e.target.value}))} readOnly={!useEdit}
                    className="w-full rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-2 text-sm text-white outline-none focus:border-yellow-400/50 read-only:opacity-70"
                    placeholder={t('withdraw.account_holder_placeholder') || "e.g. JOHN DOE"} />
                </div>
              </>)}
            </div>
            </section>
          )}

          {/* AMOUNT */}
          <section className="overflow-hidden rounded-xl border border-[#1f2128] bg-[#0c0e14]">
            <div className="border-b border-[#1f2128] px-4 py-3">
              <p className="text-sm font-semibold text-white">{t('withdraw.amount_title')}</p>
              <p className="text-xs text-zinc-500">{t('withdraw.max_amount', { amount: main.toLocaleString() })}</p>
            </div>
            <div className="p-4">
              <AmountInput value={amount} onChange={setAmount} presets={WITHDRAW_PRESETS} label="" placeholder={t('withdraw.placeholder')} />
            </div>
          </section>
        </div>

        {/* RIGHT — sticky summary rail */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
          {/* Balance */}
          <div className="rounded-xl border border-[#1f2128] bg-[#0c0e14] p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('withdraw.available_balance')}</p>
            <p className="mt-1 text-4xl font-black text-white">{main.toLocaleString()}<span className="ml-1.5 text-lg font-bold text-yellow-400">{t('common.points')}</span></p>
          </div>

          {/* Order summary */}
          <div className="rounded-xl border border-[#1f2128] bg-[#0c0e14] p-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('withdraw.summary')}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-[#1f2128] pb-2"><span className="text-zinc-400">{t('withdraw.amount')}</span><span className="font-bold text-white">{(Number(amount) || 0).toLocaleString()} {t('common.points')}</span></div>
              <div className="flex justify-between border-b border-[#1f2128] pb-2"><span className="text-zinc-400">{t('withdraw.method')}</span><span className="font-semibold text-white">{sel?.label || method}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">{t('withdraw.fee')}</span><span className="font-semibold text-white">{(sel?.note?.split("·") ?? [])[1]?.trim?.() || t('withdraw.fee_free')}</span></div>
            </div>
            <button type="button" onClick={() => setShowConfirm(true)} disabled={loading || !amount || Number(amount) <= 0 || hasActiveTurnover || (showBank && !hasFinalBank)}
              className="mt-4 w-full rounded-lg bg-yellow-400 py-3.5 text-base font-bold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? t('common.processing') : hasActiveTurnover ? t('withdraw.locked_required', { amount: remainingTurnover.toLocaleString() }) : !hasFinalBank && showBank ? t('withdraw.add_bank') : t('withdraw.request')}
            </button>
          </div>

          <p className="px-1 text-xs leading-relaxed text-zinc-600">
            {t('withdraw.disclaimer')}
          </p>
        </aside>
      </div>

      {/* CONFIRM DIALOG */}
      <ConfirmDialog
        open={showConfirm}
        title={t('withdraw.confirm_title')}
        message={t('withdraw.confirm_message', { amount })}
        onConfirm={() => {
          setShowConfirm(false);
          submit();
        }}
        onCancel={() => setShowConfirm(false)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </PageShell>
  );
}
