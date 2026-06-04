import { useState, useEffect, useMemo } from "react";
import { useStore } from "../store/useStore";
import {
  requestDeposit, fetchPlatformAccounts,
  fetchUserTransactions, getDepositLockRemaining,
} from "../store/wallet";
import { Icon } from "../components/icons";
import { useNavigate, useParams, Link } from "react-router-dom";
import { AmountInput } from "../components/ui/AmountInput";
import { EmptyState } from "../components/ui/EmptyState";
import Spinner from "../components/ui/Spinner";
import Toast from "../components/ui/Toast";
import PageShell from "../components/ui/PageShell";
import useTimer, { fmtTimer } from "../hooks/useTimer";
import useAlive from "../hooks/useAlive";
import { withTimeout } from "../utils/asyncHelpers";
import { DEPOSIT_PRESETS, DEPOSIT_LOCK_MS } from "../constants";
import { useI18n } from '../i18n';
import { wibDate } from '../utils/wib';
import ConfirmDialog from '../components/ui/ConfirmDialog';

function useWalletBalance() {
  const availableBalance = useStore((s) => s.availableBalance);
  return availableBalance ?? 0;
}

export default function DepositPage() {
  const auth     = useStore((s) => s.auth);
  const { clientUuid } = useParams();
  const navigate  = useNavigate();
  const p = (path) => `/c/${clientUuid}${path}`;
  const { t }    = useI18n();
  const nowTick  = useTimer();
  const [selected,  setSelected]  = useState(null);
  const [amount,    setAmount]    = useState("");
  const [proof,     setProof]     = useState("");
  const [proofName, setProofName] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [toast,     setToast]     = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accounts,  setAccounts]  = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [userTxs, setUserTxs] = useState([]);
  const aliveRef = useAlive();

  const balanceMain = useWalletBalance();
  const _rtTick = useStore((s) => s._rtTick);
  const lastDepositAt = useStore((s) => s.lastDepositAt);
  const setLastDepositAt = useStore((s) => s.setLastDepositAt);

  useEffect(() => {
    if (!auth?.id) return;
    fetchUserTransactions(auth.id).then(txs => setUserTxs(txs || [])).catch(() => {});
  }, [auth?.id, _rtTick]);

  // Clear stale lastDepositAt when lock expires
  useEffect(() => {
    if (lastDepositAt && nowTick - lastDepositAt >= DEPOSIT_LOCK_MS) {
      setLastDepositAt(null);
    }
  }, [nowTick, lastDepositAt, setLastDepositAt]);

  const activeLockTx = useMemo(() => {
    if (!auth) return null;
    const ux = userTxs.find((t) => t.type==="DEPOSIT" && t.status==="PENDING" &&
      Math.max(0, DEPOSIT_LOCK_MS - (nowTick - new Date(t.requestedAt).getTime())) > 0);
    if (ux) return ux;
    // Fallback: use lastDepositAt from store (survives page navigation)
    if (lastDepositAt && nowTick - lastDepositAt < DEPOSIT_LOCK_MS) {
      return { type: "DEPOSIT", status: "PENDING", requestedAt: new Date(lastDepositAt).toISOString() };
    }
    return null;
  }, [auth, userTxs, nowTick, lastDepositAt]);

  const lockRemaining  = activeLockTx ? getDepositLockRemaining(activeLockTx, nowTick) || 0 : 0;
  const expiredPending = useMemo(() => {
    if (!auth) return [];
    return userTxs.filter((t) => t.type==="DEPOSIT" && t.status==="PENDING" &&
      Math.max(0, DEPOSIT_LOCK_MS - (nowTick - new Date(t.requestedAt).getTime())) <= 0);
  }, [auth, userTxs, nowTick]);

  useEffect(() => { if (!auth?.username) navigate("/login"); }, [auth, navigate]);
  useEffect(() => {
    let alive = true;
    setAccountsLoading(true);
    fetchPlatformAccounts()
      .then((r) => { if (alive && Array.isArray(r)) setAccounts(r); })
      .catch(() => {})
      .finally(() => { if (alive) setAccountsLoading(false); });
    return () => { alive = false; };
  }, []);
  if (!auth?.username) return null;

  const handleProof = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setProofName(file.name);
    const r = new FileReader(); r.onload = (ev) => setProof(ev.target.result); r.readAsDataURL(file);
  };

  const submit = async () => {
    if (lockRemaining > 0) return setToast({ type:"err", text: t('deposit.locked_timer', { timer: fmtTimer(lockRemaining) }) });
    if (!selected)          return setToast({ type:"err", text: t('deposit.select_method') });
    const amt = Number(amount);
    if (!amt || amt <= 0)   return setToast({ type:"err", text: t('deposit.enter_amount') });
    if (!proof)             return setToast({ type:"err", text: t('deposit.upload_proof') });
    setLoading(true);
    try {
      const r = await withTimeout(
        requestDeposit({ username:auth.username, userUuid:auth.id, amount:amt, method:selected.label, proof, platformAccountId:selected.id }),
        10000
      );
      setLoading(false);
      if (!r?.ok) return setToast({ type:"err", text: r?.error || t('deposit.deposit_failed') });
      setToast({ type:"ok", text: t('deposit.processing') });
      // Engage the 15-min deposit lock immediately, without waiting for the re-fetch
      // round-trip — optimistically insert the new PENDING tx so the banner shows now.
      const optimisticTx = {
        id: r.tx?.id,
        type: "DEPOSIT",
        status: "PENDING",
        amount: r.tx?.amount ?? amt,
        method: selected?.label || "",
        requestedAt: r.tx?.requestedAt || new Date().toISOString(),
      };
      setUserTxs((prev) => [optimisticTx, ...prev.filter((tx) => tx.id !== optimisticTx.id)]);
      setLastDepositAt(Date.now());
      setAmount(""); setProof(""); setProofName(""); setSelected(null);
      setTimeout(() => {
        if (!aliveRef.current) return;
    fetchUserTransactions(auth.id).then(txs => { if (aliveRef.current) setUserTxs(txs || []); }).catch(() => {});
      }, 500);
    } catch (err) {
      setLoading(false);
      // If client timed out, the server may have processed the request.
      // Idempotency key prevents a true duplicate, but show a "may still
      // be processing" notice so user doesn't immediately retry blindly.
      if (err?.message === 'Request timeout') {
        setToast({ type: 'warn', text: t('common.request_timeout') });
      } else {
        setToast({ type: 'err', text: t('common.network_error') });
      }
    }
  };

  const depositHistory = userTxs.filter(t => t.type === "DEPOSIT");
  return (
    <PageShell
      title={t('deposit.title')}
      subtitle={t('deposit.subtitle')}
      back={{ to: p('/dashboard'), label: t('common.back') }}
      actions={
        <div className="hidden text-right sm:block">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('deposit.balance')}</p>
          <p className="font-mono text-2xl font-black text-yellow-400">{balanceMain.toLocaleString()} {t('common.points')}</p>
        </div>
      }
    >
      {/* LOCK BANNER */}
      {lockRemaining > 0 && (
        <div className="mt-5 space-y-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-yellow-400">{t('deposit.locked')}</span>
            <span className="font-mono text-yellow-400">{fmtTimer(lockRemaining)}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[#1f2128]">
            <div className="h-full bg-yellow-400" style={{ width:`${Math.round((lockRemaining/(15*60*1000))*100)}%` }} />
          </div>
        </div>
      )}

      {/* EXPIRED */}
      {expiredPending.length > 0 && !lockRemaining && (
        <div className="mt-5 space-y-2">
          {expiredPending.map((tx) => (
            <div key={tx.id} className="rounded-lg border border-orange-400/30 bg-orange-400/10 p-3">
              <p className="text-sm text-orange-400">{t('deposit.expired')}</p>
            </div>
          ))}
        </div>
      )}

      {/* TWO-COLUMN PRO LAYOUT */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">

        {/* LEFT — form */}
        <div className="space-y-6">
          {/* METHOD */}
          <section className="overflow-hidden rounded-xl border border-[#1f2128] bg-[#0c0e14]">
            <div className="border-b border-[#1f2128] px-4 py-3">
              <p className="text-sm font-semibold text-white">{t('deposit.select_payment')}</p>
              <p className="text-xs text-zinc-500">{t('deposit.payment_desc')}</p>
            </div>
            <div className="p-4">
              {accountsLoading ? (
                <Spinner size="sm" />
              ) : accounts.length === 0 ? (
                <EmptyState icon="💳" text={t('deposit.no_methods')} subtitle={t('deposit.contact_support')} />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {accounts.map((acc) => {
                    const active = selected?.id === acc.id;
                    return (
                      <button key={acc.id} type="button" onClick={() => setSelected(active ? null : acc)}
                        className={`rounded-lg border p-4 text-left transition ${active ? "border-emerald-400 bg-emerald-400/10" : "border-[#1f2128] hover:border-zinc-500"}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">{acc.label}</p>
                            <p className="mt-0.5 text-xs text-zinc-500">{acc.note}</p>
                          </div>
                          {active && <Icon.Check size={18} className="text-emerald-400" />}
                        </div>
                        {active && (
                          <div className="mt-4 space-y-2 border-t border-emerald-400/20 pt-4">
                            <div className="flex justify-between text-xs"><span className="text-zinc-500">{t('deposit.account_name')}</span><span className="font-semibold text-white">{acc.name}</span></div>
                            <div className="flex justify-between text-xs"><span className="text-zinc-500">{t('deposit.account_number')}</span><span className="font-mono text-white">{acc.number}</span></div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* AMOUNT */}
          <section className="overflow-hidden rounded-xl border border-[#1f2128] bg-[#0c0e14]">
            <div className="border-b border-[#1f2128] px-4 py-3">
              <p className="text-sm font-semibold text-white">{t('deposit.enter_amount_title')}</p>
              <p className="text-xs text-zinc-500">{t('deposit.enter_amount_desc')}</p>
            </div>
            <div className="p-4">
              <AmountInput value={amount} onChange={setAmount} presets={DEPOSIT_PRESETS} label="" placeholder={t('deposit.placeholder_amount')} />
            </div>
          </section>

          {/* PROOF */}
          <section className="overflow-hidden rounded-xl border border-[#1f2128] bg-[#0c0e14]">
            <div className="border-b border-[#1f2128] px-4 py-3">
              <p className="text-sm font-semibold text-white">{t('deposit.upload_proof_title')}</p>
              <p className="text-xs text-zinc-500">{t('deposit.upload_proof_desc')}</p>
            </div>
            <div className="p-4">
              <label className={`block cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition ${proof ? "border-emerald-500 bg-emerald-500/10" : "border-[#1f2128] hover:border-zinc-500"}`}>
                <input type="file" accept="image/*" className="hidden" onChange={handleProof} />
                {proof ? (
                  <div className="space-y-2"><p className="text-sm font-semibold text-emerald-400">{t('common.file_selected')}</p><p className="text-xs text-emerald-400">{proofName}</p></div>
                ) : (
                  <div className="space-y-2"><p className="text-sm font-semibold text-white">{t('common.click_to_upload')}</p><p className="text-xs text-zinc-500">{t('common.or_drag_drop')}</p></div>
                )}
              </label>
              {proof && <img src={proof} alt={t('deposit.proof')} className="mt-3 h-40 w-full rounded-lg border border-[#1f2128] object-cover" />}
            </div>
          </section>
        </div>

        {/* RIGHT — sticky summary rail */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:h-fit">
          <div className="rounded-xl border border-[#1f2128] bg-[#0c0e14] p-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('deposit.available_balance')}</p>
            <p className="mt-1 text-4xl font-black text-white">{balanceMain.toLocaleString()}<span className="ml-1.5 text-lg font-bold text-yellow-400">{t('common.points')}</span></p>
          </div>

          <div className="rounded-xl border border-[#1f2128] bg-[#0c0e14] p-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('deposit.summary')}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-[#1f2128] pb-2"><span className="text-zinc-400">{t('deposit.amount')}</span><span className="font-bold text-white">{(Number(amount) || 0).toLocaleString()} {t('common.points')}</span></div>
              <div className="flex justify-between border-b border-[#1f2128] pb-2"><span className="text-zinc-400">{t('deposit.method')}</span><span className="font-semibold text-white">{selected?.label || "—"}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">{t('deposit.proof')}</span><span className={`font-semibold ${proof ? "text-emerald-400" : "text-zinc-500"}`}>{proof ? t('common.attached') : t('common.required')}</span></div>
            </div>
            <button type="button" onClick={() => setShowConfirm(true)} disabled={loading || lockRemaining > 0}
              className="mt-4 w-full rounded-lg bg-yellow-400 py-3.5 text-base font-bold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? t('common.processing') : lockRemaining > 0 ? t('deposit.locked_timer_btn', { timer: fmtTimer(lockRemaining) }) : t('deposit.confirm')}
            </button>
          </div>

          <p className="px-1 text-xs leading-relaxed text-zinc-600">
            {t('deposit.disclaimer')}
          </p>
        </aside>
      </div>

      {/* HISTORY — full width */}
      {depositHistory.length > 0 && (
        <div className="mt-8 border-t border-[#1f2128] pt-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">{t('deposit.history')}</p>
              <p className="text-xs text-zinc-500">{t('deposit.history_desc')}</p>
            </div>
            {depositHistory.length > 6 && (
              <Link
                to={cp('/wallet/history') + '?type=Deposit'}
                className="text-xs font-semibold text-yellow-400 hover:text-yellow-300 transition"
              >
                {t('common.see_all')} →
              </Link>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {depositHistory.slice(0, 6).map((tx) => (
              <div key={tx.id} className="rounded-lg border border-[#1f2128] bg-[#0c0e14] px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono text-emerald-400 font-bold">{tx.referenceCode}</p>
                  <span className={`text-xs font-bold ${tx.status === "APPROVED" ? "text-emerald-400" : tx.status === "REJECTED" ? "text-red-400" : "text-yellow-400"}`}>{tx.status}</span>
                </div>
                <p className="text-sm font-semibold text-white">{tx.amount.toLocaleString()} {t('common.points')}</p>
                <p className="text-xs text-zinc-500">{tx.method} · {wibDate(tx.requestedAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CONFIRM DIALOG */}
      <ConfirmDialog
        open={showConfirm}
        title={t('deposit.confirm_title')}
        message={t('deposit.confirm_message', { amount })}
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
