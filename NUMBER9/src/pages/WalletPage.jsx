import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useStore } from "../store/useStore";
import {
  requestDeposit, fetchPlatformAccounts,
  fetchUserTransactions, getDepositLockRemaining,
  requestWithdraw, fetchTurnoverSummary, updateUserBank,
} from "../store/wallet";
import { supabase } from "../utils/supabase";
import { Icon } from "../components/icons";
import SectionHead from "../components/ui/SectionHead";
import { AmountInput } from "../components/ui/AmountInput";
import { EmptyState } from "../components/ui/EmptyState";
import Spinner from "../components/ui/Spinner";
import Toast from "../components/ui/Toast";
import PageShell from "../components/ui/PageShell";

import useTimer, { fmtTimer } from "../hooks/useTimer";
import useAlive from "../hooks/useAlive";
import { withTimeout } from "../utils/asyncHelpers";
import { DEPOSIT_PRESETS, WITHDRAWAL_METHODS, WITHDRAW_PRESETS, DEPOSIT_LOCK_MS } from "../constants";
import { useI18n } from '../i18n';
import { wibDate } from '../utils/wib';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { formatNumber } from '../utils/format';

const TABS = [
  { k: 'deposit', l: 'wallet.tabs_deposit', I: Icon.ArrowDown },
  { k: 'withdraw', l: 'wallet.tabs_withdraw', I: Icon.ArrowUp },
  { k: 'turnover', l: 'wallet.tabs_turnover', I: Icon.Turnover },
];

const fmt = (n) => formatNumber(n);

export default function WalletPage() {
  const auth = useStore((s) => s.auth);
  const availableBalance = useStore((s) => s.availableBalance);
  const fetchBalances = useStore((s) => s.fetchBalances);

  const lastDepositAt = useStore((s) => s.lastDepositAt);
  const setLastDepositAt = useStore((s) => s.setLastDepositAt);

  const _rtTick = useStore((s) => s._rtTick);
  const _accountsVersion = useStore((s) => s._accountsVersion);
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const nowTick = useTimer();
  const aliveRef = useAlive();
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'deposit');
  const [toast, setToast] = useState(null);

  const balanceMain = availableBalance ?? 0;

  useEffect(() => { if (!auth?.username) navigate("/login"); }, [auth, navigate]);

  useEffect(() => {
    if (auth?.id) {
      console.log('[WalletPage] Fetching balances for user:', auth?.id);
      fetchBalances().then(() => {
        console.log('[WalletPage] Balance fetch complete');
      });
    } else {
      console.log('[WalletPage] No auth.id available');
    }
  }, [auth?.id, fetchBalances]);

  return (
    <PageShell
      title={t('wallet.title')}
      subtitle={t('wallet.subtitle')}
      back={{ to: `/c/${auth?.id}/dashboard`, label: t('common.back') }}
      actions={
        <div className="hidden text-right sm:block">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('wallet.saldo')}</p>
          <p className="font-mono text-2xl font-black text-yellow-400">{fmt(balanceMain)} {t('common.points')}</p>
        </div>
      }
    >
      {/* TABS */}
      <div className="mb-6 flex gap-1 rounded-xl border border-[#1f2128] bg-[#0c0e14] p-1">
        {TABS.map((tb) => {
          const active = tab === tb.k;
          return (
            <button key={tb.k} onClick={() => setTab(tb.k)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition sm:gap-2 sm:text-xs ${
                active ? 'bg-yellow-400 text-black shadow' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              <tb.I size={14} /> {t(tb.l)}
            </button>
          );
        })}
      </div>

      {tab === 'deposit' && <DepositTab auth={auth} balanceMain={balanceMain} lastDepositAt={lastDepositAt} setLastDepositAt={setLastDepositAt} nowTick={nowTick} _rtTick={_rtTick} _accountsVersion={_accountsVersion} aliveRef={aliveRef} t={t} setToast={setToast} />}
      {tab === 'withdraw' && <WithdrawTab auth={auth} balanceMain={balanceMain} _rtTick={_rtTick} aliveRef={aliveRef} t={t} setToast={setToast} />}
      {tab === 'turnover' && <TurnoverTab auth={auth} _rtTick={_rtTick} aliveRef={aliveRef} t={t} setToast={setToast} />}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </PageShell>
  );
}

/* ===== DEPOSIT TAB ===== */
function DepositTab({ auth, lastDepositAt, setLastDepositAt, nowTick, _rtTick, _accountsVersion, aliveRef, t, setToast }) {
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [proof, setProof] = useState("");
  const [proofName, setProofName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [userTxs, setUserTxs] = useState([]);

  useEffect(() => {
    if (!auth?.id) return;
    fetchUserTransactions(auth.id).then(txs => setUserTxs(txs || [])).catch(() => {});
  }, [auth?.id, _rtTick]);

  useEffect(() => {
    if (lastDepositAt && nowTick - lastDepositAt >= DEPOSIT_LOCK_MS) setLastDepositAt(null);
  }, [nowTick, lastDepositAt, setLastDepositAt]);

  useEffect(() => {
    let alive = true;
    setAccountsLoading(true);
    console.log('[DepositTab] Component mounted, fetching accounts');
    (async () => {
      try {
        const r = await fetchPlatformAccounts();
        if (!alive) return;
        console.log('[DepositTab] fetchPlatformAccounts returned:', r);
        if (Array.isArray(r)) {
          console.log('[DepositTab] Loaded accounts:', r.length, r);
          setAccounts(r);
        } else {
          console.warn('[DepositTab] fetchPlatformAccounts returned non-array:', r);
          setAccounts([]);
        }
      } catch (e) {
        if (alive) {
          console.error('[DepositTab] fetchPlatformAccounts error:', e);
          setAccounts([]);
        }
      } finally {
        if (alive) setAccountsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setAccountsLoading(true);
    console.log('[DepositTab] _accountsVersion changed:', _accountsVersion, ', refetching accounts');
    (async () => {
      try {
        const r = await fetchPlatformAccounts();
        if (!alive) return;
        console.log('[DepositTab] fetchPlatformAccounts returned:', r);
        if (Array.isArray(r)) {
          console.log('[DepositTab] Loaded accounts:', r.length, r);
          setAccounts(r);
        } else {
          console.warn('[DepositTab] fetchPlatformAccounts returned non-array:', r);
          setAccounts([]);
        }
      } catch (e) {
        if (alive) {
          console.error('[DepositTab] fetchPlatformAccounts error:', e);
          setAccounts([]);
        }
      } finally {
        if (alive) setAccountsLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [_accountsVersion]);

  const activeLockTx = useMemo(() => {
    if (!auth) return null;
    const ux = userTxs.find((t) => t.type==="DEPOSIT" && t.status==="PENDING" &&
      Math.max(0, DEPOSIT_LOCK_MS - (nowTick - new Date(t.requestedAt).getTime())) > 0);
    if (ux) return ux;
    if (lastDepositAt && nowTick - lastDepositAt < DEPOSIT_LOCK_MS) return { type: "DEPOSIT", status: "PENDING", requestedAt: new Date(lastDepositAt).toISOString() };
    return null;
  }, [auth, userTxs, nowTick, lastDepositAt]);

  const lockRemaining = activeLockTx ? getDepositLockRemaining(activeLockTx, nowTick) || 0 : 0;
  const expiredPending = useMemo(() => {
    if (!auth) return [];
    return userTxs.filter((t) => t.type==="DEPOSIT" && t.status==="PENDING" &&
      Math.max(0, DEPOSIT_LOCK_MS - (nowTick - new Date(t.requestedAt).getTime())) <= 0);
  }, [auth, userTxs, nowTick]);

  const handleProof = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setProofName(file.name);
    const r = new FileReader();
    r.onload = (ev) => setProof(ev.target.result);
    r.onerror = () => { setProofName(''); setToast({ type: 'err', text: t('common.file_read_error') }); };
    r.readAsDataURL(file);
  };

  const submit = async () => {
    if (lockRemaining > 0) return setToast({ type:"err", text: t('deposit.locked_timer', { timer: fmtTimer(lockRemaining) }) });
    if (!selected) return setToast({ type:"err", text: t('deposit.select_method') });
    const amt = Number(amount);
    if (!amt || amt <= 0) return setToast({ type:"err", text: t('deposit.enter_amount') });
    if (!proof) return setToast({ type:"err", text: t('deposit.upload_proof') });
    setLoading(true);
    try {
      const r = await withTimeout(
        requestDeposit({ username:auth.username, userUuid:auth.id, amount:amt, method:selected.label, proof, platformAccountId:selected.id }),
        10000
      );
      setLoading(false);
      if (!r?.ok) return setToast({ type:"err", text: r?.error || t('deposit.deposit_failed') });
      setToast({ type:"ok", text: t('deposit.processing') });
      const optimisticTx = { id: r.tx?.id, type: "DEPOSIT", status: "PENDING", amount: r.tx?.amount ?? amt, method: selected?.label || "", requestedAt: r.tx?.requestedAt || new Date().toISOString() };
      setUserTxs((prev) => [optimisticTx, ...prev.filter((tx) => tx.id !== optimisticTx.id)]);
      setLastDepositAt(nowTick);
      setAmount(""); setProof(""); setProofName(""); setSelected(null);
      setTimeout(() => { if (aliveRef.current) fetchUserTransactions(auth.id).then(txs => { if (aliveRef.current) setUserTxs(txs || []); }).catch(() => {}); }, 500);
    } catch (err) {
      setLoading(false);
      setToast({ type: err?.message === 'Request timeout' ? 'warn' : 'err', text: err?.message === 'Request timeout' ? t('common.request_timeout') : t('common.network_error') });
    }
  };

  const depositHistory = userTxs.filter(t => t.type === "DEPOSIT");

  return (
    <div className="space-y-6">
      {lockRemaining > 0 && (
        <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-yellow-400">{t('deposit.locked')}</span>
            <span className="font-mono text-yellow-400">{fmtTimer(lockRemaining)}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#1f2128]">
            <div className="h-full bg-yellow-400" style={{ width:`${Math.round((lockRemaining/(15*60*1000))*100)}%` }} />
          </div>
        </div>
      )}
      {expiredPending.length > 0 && !lockRemaining && expiredPending.map((tx) => (
        <div key={tx.id} className="rounded-lg border border-orange-400/30 bg-orange-400/10 p-3">
          <p className="text-sm text-orange-400">{t('deposit.expired')}</p>
        </div>
      ))}

      {accountsLoading ? <Spinner size="sm" /> : accounts.length === 0 ? (
        <EmptyState icon="💳" text={t('deposit.no_methods')} subtitle={t('deposit.contact_support')} />
      ) : (
        <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          <div className="border-b border-[#1f2128] px-4 py-3">
            <p className="text-sm font-semibold text-white">{t('deposit.select_payment')}</p>
            <p className="text-xs text-zinc-500">{t('deposit.payment_desc')}</p>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-2">
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
        </section>
      )}

      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="border-b border-[#1f2128] px-4 py-3">
          <p className="text-sm font-semibold text-white">{t('deposit.enter_amount_title')}</p>
          <p className="text-xs text-zinc-500">{t('deposit.enter_amount_desc')}</p>
        </div>
        <div className="px-4 py-4">
          <AmountInput value={amount} onChange={setAmount} presets={DEPOSIT_PRESETS} label="" placeholder={t('deposit.placeholder_amount')} />
        </div>
      </section>

      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="border-b border-[#1f2128] px-4 py-3">
          <p className="text-sm font-semibold text-white">{t('deposit.upload_proof_title')}</p>
          <p className="text-xs text-zinc-500">{t('deposit.upload_proof_desc')}</p>
        </div>
        <div className="p-4">
          <label className={`block cursor-pointer rounded-lg border-2 border-dashed p-5 sm:p-8 text-center transition ${proof ? "border-emerald-500 bg-emerald-500/10" : "border-[#1f2128] hover:border-zinc-500"}`}>
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

      <div className="rounded-xl border border-[#1f2128] bg-[#0c0e14] p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('deposit.summary')}</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-[#1f2128] pb-2"><span className="text-zinc-400">{t('deposit.amount')}</span><span className="font-bold text-white">{fmt(Number(amount) || 0)} {t('common.points')}</span></div>
          <div className="flex justify-between border-b border-[#1f2128] pb-2"><span className="text-zinc-400">{t('deposit.method')}</span><span className="font-semibold text-white">{selected?.label || "—"}</span></div>
          <div className="flex justify-between"><span className="text-zinc-400">{t('deposit.proof')}</span><span className={`font-semibold ${proof ? "text-emerald-400" : "text-zinc-500"}`}>{proof ? t('common.attached') : t('common.required')}</span></div>
        </div>
        <button type="button" onClick={() => setShowConfirm(true)} disabled={loading || lockRemaining > 0}
          className="mt-4 w-full rounded-lg bg-yellow-400 py-3.5 text-sm font-extrabold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? t('common.processing') : lockRemaining > 0 ? t('deposit.locked_timer_btn', { timer: fmtTimer(lockRemaining) }) : t('deposit.confirm')}
        </button>
      </div>

      {depositHistory.length > 0 && (
        <div className="border-t border-[#1f2128] pt-6">
          <p className="mb-4 text-sm font-semibold text-white">{t('deposit.history')}</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {depositHistory.slice(0, 6).map((tx) => (
              <div key={tx.id} className="rounded-lg border border-[#1f2128] bg-[#0c0e14] px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono text-emerald-400 font-bold">{tx.referenceCode}</p>
                  <span className={`text-xs font-bold ${tx.status === "APPROVED" ? "text-emerald-400" : tx.status === "REJECTED" ? "text-red-400" : "text-yellow-400"}`}>{tx.status}</span>
                </div>
                <p className="text-sm font-semibold text-white">{fmt(tx.amount)} {t('common.points')}</p>
                <p className="text-xs text-zinc-500">{tx.method} · {wibDate(tx.requestedAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog open={showConfirm} title={t('deposit.confirm_title')} message={t('deposit.confirm_message', { amount })} onConfirm={() => { setShowConfirm(false); submit(); }} onCancel={() => setShowConfirm(false)} />
    </div>
  );
}

/* ===== WITHDRAW TAB ===== */
function WithdrawTab({ auth, balanceMain, _rtTick, aliveRef, t, setToast }) {
  const fetchProfile = useStore((s) => s.fetchProfile);
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [bank, setBank] = useState({ bankName: '', bankAccountNumber: '', bankAccountName: '' });
  const [editBank, setEditBank] = useState({ name: '', number: '', holder: '' });
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [turnoverData, setTurnoverData] = useState({ remaining: 0, isUnlocked: true });
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!auth?.id) return;
    const p1 = fetchProfile().then(prof => {
      if (aliveRef.current && prof && !prof.error) {
        setBank({
          bankName: prof.bankName || '',
          bankAccountNumber: prof.bankAccountNumber || '',
          bankAccountName: prof.bankAccountName || '',
        });
      }
    }).catch(() => {});
    const p2 = fetchTurnoverSummary(auth.id).then(r => { if (aliveRef.current) setTurnoverData(r); }).catch(() => {});
    Promise.allSettled([p1, p2]).finally(() => { if (aliveRef.current) setDataLoading(false); });
  }, [auth?.id, _rtTick, aliveRef, fetchProfile]);

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
    const minAmt = sel?.min ?? 0;
    if (amt < minAmt) return setToast({ type: "err", text: t('withdraw.below_minimum', { min: fmt(minAmt) }) });
    if (amt > balanceMain) return setToast({ type: "err", text: t('withdraw.insufficient') });
    if (showBank && !hasFinalBank) return setToast({ type: "err", text: t('withdraw.add_bank') });
    if (hasActiveTurnover) return setToast({ type: "err", text: t('withdraw.turnover_required', { amount: fmt(remainingTurnover) }) });
    setLoading(true);
    try {
      const r = await withTimeout(
        requestWithdraw({ username: auth.username, userUuid: auth.id, amount: amt, method: sel?.label || method, bankName: showBank ? finalBankName : "", bankAccountNumber: showBank ? finalBankAccNum : "", bankAccountName: showBank ? finalBankAccName : "" }),
        10000
      );
      setLoading(false);
      if (!r?.ok) return setToast({ type: "err", text: r?.error || t('withdraw.withdraw_failed') });
      if (useEdit && showBank && finalBankName && finalBankAccNum && finalBankAccName) {
        updateUserBank(auth.id, finalBankName, finalBankAccNum, finalBankAccName)
          .then(() => setBank({ bankName: finalBankName, bankAccountNumber: finalBankAccNum, bankAccountName: finalBankAccName }))
          .catch(() => {});
        setIsEditingBank(false);
      }
      setToast({ type: "ok", text: t('withdraw.submitted') });
      setAmount("");
    } catch (err) {
      setLoading(false);
      setToast({ type: err?.message === 'Request timeout' ? 'warn' : 'err', text: err?.message === 'Request timeout' ? t('common.request_timeout') : t('common.network_error') });
    }
  };

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-4 ${hasActiveTurnover ? 'border-yellow-400/30 bg-yellow-400/10' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
        <div className="flex items-center justify-between">
          <p className={`text-xs font-bold ${hasActiveTurnover ? 'text-yellow-400' : 'text-emerald-400'}`}>{t('withdraw.turnover_title')}</p>
          <span className={`text-[10px] font-bold ${hasActiveTurnover ? 'text-yellow-300' : 'text-emerald-400'}`}>
            {fmt(turnoverData.achieved)} / {fmt(turnoverData.required)} P
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1f2128]">
          <div className={`h-full transition-all duration-700 ${hasActiveTurnover ? 'bg-yellow-400' : 'bg-emerald-400'}`}
            style={{ width: `${turnoverData.required > 0 ? Math.min(100, Math.round((turnoverData.achieved / turnoverData.required) * 100)) : 100}%` }} />
        </div>
        <p className={`mt-1.5 text-xs ${hasActiveTurnover ? 'text-yellow-300' : 'text-emerald-400'}`}>
          {hasActiveTurnover ? t('withdraw.turnover_remaining', { amount: fmt(remainingTurnover) }) : '✓ ' + t('turnover.unlocked')}
        </p>
      </div>

      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
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

      {showBank && (
        <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          <div className="border-b border-[#1f2128] px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">{t('withdraw.destination')}</p>
              <p className="text-xs text-zinc-500">{t('withdraw.destination_desc')}</p>
            </div>
            {!dataLoading && hasBankData && (
              <button type="button" onClick={() => { setIsEditingBank(!isEditingBank); if (!isEditingBank) setEditBank({ name: bankName, number: bankAccNum, holder: bankAccName }); }}
                className="text-[10px] font-bold text-yellow-400 hover:text-yellow-300">{isEditingBank ? t('common.cancel') : t('common.edit')}</button>
            )}
          </div>
          <div className="p-4 space-y-3">
            {dataLoading ? <Spinner size="sm" /> : (
              <>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{t('withdraw.bank_name')}</label>
                  <input value={useEdit ? editBank.name : bankName} onChange={e => setEditBank(p => ({...p, name: e.target.value}))} readOnly={!useEdit}
                    className="w-full rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-2 text-base sm:text-sm text-white outline-none focus:border-yellow-400/50 read-only:opacity-70" placeholder="e.g. BCA" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{t('withdraw.account_number')}</label>
                  <input value={useEdit ? editBank.number : bankAccNum} onChange={e => setEditBank(p => ({...p, number: e.target.value}))} readOnly={!useEdit}
                    className="w-full rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-2 text-base sm:text-sm text-white outline-none focus:border-yellow-400/50 read-only:opacity-70" placeholder="e.g. 1234567890" inputMode="numeric" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{t('withdraw.account_holder')}</label>
                  <input value={useEdit ? editBank.holder : bankAccName} onChange={e => setEditBank(p => ({...p, holder: e.target.value}))} readOnly={!useEdit}
                    className="w-full rounded-lg border border-[#1f2128] bg-[#13151c] px-3 py-2 text-base sm:text-sm text-white outline-none focus:border-yellow-400/50 read-only:opacity-70" placeholder="e.g. JOHN DOE" />
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="border-b border-[#1f2128] px-4 py-3">
          <p className="text-sm font-semibold text-white">{t('withdraw.amount_title')}</p>
          <p className="text-xs text-zinc-500">{t('withdraw.max_amount', { amount: fmt(balanceMain) })}</p>
        </div>
        <div className="px-4 py-4">
          <AmountInput value={amount} onChange={setAmount} presets={WITHDRAW_PRESETS} label="" placeholder={t('withdraw.placeholder')} />
        </div>
      </section>

      <div className="rounded-xl border border-[#1f2128] bg-[#0c0e14] p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('withdraw.summary')}</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-[#1f2128] pb-2"><span className="text-zinc-400">{t('withdraw.amount')}</span><span className="font-bold text-white">{fmt(Number(amount) || 0)} {t('common.points')}</span></div>
          <div className="flex justify-between border-b border-[#1f2128] pb-2"><span className="text-zinc-400">{t('withdraw.method')}</span><span className="font-semibold text-white">{sel?.label || method}</span></div>
          <div className="flex justify-between"><span className="text-zinc-400">{t('withdraw.fee')}</span><span className="font-semibold text-white">{(sel?.note?.split("·") ?? [])[1]?.trim?.() || t('withdraw.fee_free')}</span></div>
        </div>
        <button type="button" onClick={() => setShowConfirm(true)} disabled={loading || !amount || Number(amount) <= 0 || hasActiveTurnover || (showBank && !hasFinalBank)}
          className="mt-4 w-full rounded-lg bg-yellow-400 py-3.5 text-sm font-extrabold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? t('common.processing') : hasActiveTurnover ? t('withdraw.locked_required', { amount: fmt(remainingTurnover) }) : !hasFinalBank && showBank ? t('withdraw.add_bank') : t('withdraw.request')}
        </button>
      </div>

      <ConfirmDialog open={showConfirm} title={t('withdraw.confirm_title')} message={t('withdraw.confirm_message', { amount })} onConfirm={() => { setShowConfirm(false); submit(); }} onCancel={() => setShowConfirm(false)} />
    </div>
  );
}

/* ===== TURNOVER TAB ===== */
function TurnoverTab({ auth, _rtTick, aliveRef, t, setToast }) {
  const [data, setData] = useState({ required: 0, achieved: 0, remaining: 0, pct: 0, totalDeposited: 0, locks: [], isUnlocked: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isInitialLoadRef = useRef(true);

  const refetch = useCallback(async () => {
    if (!auth?.id) return;
    const isInitial = isInitialLoadRef.current;
    if (!isInitial) setRefreshing(true);
    try {
      const d = await fetchTurnoverSummary(auth.id);
      if (aliveRef.current) { setData(d); setLoading(false); isInitialLoadRef.current = false; }
    } catch {
      if (aliveRef.current) { setToast({ type: 'err', text: t('common.network_error') }); setLoading(false); isInitialLoadRef.current = false; }
    } finally { if (aliveRef.current) setRefreshing(false); }
  }, [auth?.id, aliveRef, t, setToast]);

  useEffect(() => {
    if (!auth?.id) return;
    queueMicrotask(() => refetch());
  }, [auth?.id, _rtTick, refetch]);

  useEffect(() => {
    if (!auth?.id || !supabase) return;
    const channel = supabase.channel(`deposit_locks_${auth.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_locks', filter: `user_id=eq.${auth.id}` }, () => { if (aliveRef.current) refetch(); })
      .subscribe();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [auth?.id, refetch, aliveRef]);

  const [openFaq, setOpenFaq] = useState(0);
  const FAQS = useMemo(() => [
    { q: t('turnover.q1'), a: t('turnover.q1_a') },
    { q: t('turnover.q2'), a: t('turnover.q2_a') },
    { q: t('turnover.q3'), a: t('turnover.q3_a') },
  ], [t]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="border-b border-[#1f2128] px-3 py-2 lg:px-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-400">{t('turnover.title')}</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-zinc-500">{fmt(data.achieved)} / {fmt(data.required)}</span>
              <button onClick={refetch} disabled={refreshing} className="rounded p-1 text-zinc-500 hover:text-yellow-400 disabled:opacity-50" title="Refresh">
                <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}><Icon.Refresh size={12} /></span>
              </button>
            </div>
          </div>
        </div>
        <div className="px-3 py-3 lg:px-4 lg:py-4">
          {data.isUnlocked ? (
            <>
              <p className="text-2xl font-black leading-tight text-yellow-400 lg:text-3xl">✓ {t('turnover.unlocked')}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('turnover.unlocked_sub')}</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-black leading-none tabular-nums text-white lg:text-5xl">{data.pct}<span className="text-2xl text-yellow-400">{t('turnover.percent')}</span></p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">{t('turnover.to_unlock')}</p>
            </>
          )}
          <div className="mt-3 h-2.5 overflow-hidden rounded-lg bg-[#1f2128]">
            <div className="h-full bg-yellow-400 transition-all duration-700" style={{ width: `${data.isUnlocked ? 100 : data.pct}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {[[t('turnover.deposit'), fmt(data.totalDeposited)], [t('turnover.required'), fmt(data.required)], [t('turnover.done'), fmt(data.achieved), true], [t('turnover.left'), fmt(data.remaining)]].map(([l, v, a]) => (
              <div key={l} className="rounded-lg border border-[#1f2128] bg-[#13151c] px-1.5 py-1.5 lg:px-2">
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{l}</p>
                <p className={`mt-0.5 text-[12px] font-extrabold tabular-nums lg:text-sm ${a ? 'text-yellow-400' : 'text-white'}`}>{v} {t('common.points')}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionHead>{t('turnover.breakdown')}</SectionHead>
        <div className="divide-y divide-[#1f2128] rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          {loading && <Spinner size="sm" />}
          {!loading && (data.locks?.length ?? 0) === 0 && (
            <div className="px-3 py-4 text-center"><p className="text-[11px] text-zinc-500">{t('turnover.no_activity')}</p></div>
          )}
          {!loading && data.locks?.map((l, i) => (
            <div key={i} className="px-2.5 py-2 lg:px-3">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-[12px] font-bold text-white">{t('turnover.deposit')} {fmt(l.amount)} P × 1×</p>
                {l.done ? <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400">✓ {t('turnover.done')}</span>
                : <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{fmt(l.applied)} / {fmt(l.required)} · {l.pct}%</span>}
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#1f2128]">
                <div className={`h-full transition-all duration-700 ${l.done ? 'bg-yellow-400' : 'bg-zinc-500'}`} style={{ width: `${l.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHead>{t('turnover.rules')}</SectionHead>
        <div className="divide-y divide-[#1f2128] rounded-xl border border-[#1f2128] bg-[#0c0e14]">
          {FAQS.map((f, i) => {
            const open = openFaq === i;
            return (
              <div key={i}>
                <button onClick={() => setOpenFaq(open ? -1 : i)} className="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left">
                  <span className={`text-[12px] font-bold ${open ? 'text-yellow-400' : 'text-white'}`}>{f.q}</span>
                  <span className={`shrink-0 transition ${open ? 'rotate-180 text-yellow-400' : 'text-zinc-500'}`}><Icon.ChevronDown size={14} /></span>
                </button>
                {open && <p className="px-2.5 pb-2 text-[11px] leading-relaxed text-zinc-400">{f.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex gap-2">
        <Link to={`/c/${auth?.id}/king`} className="flex-1 rounded-lg bg-yellow-400 py-2 text-center text-[11px] font-bold text-black hover:bg-yellow-300">{t('turnover.trade_marketplace')}</Link>
        <Link to={`/c/${auth?.id}/trading`} className="flex-1 rounded-lg border border-[#1f2128] py-2 text-center text-[11px] font-bold text-zinc-300 hover:text-white">{t('turnover.trade_now')}</Link>
      </div>
    </div>
  );
}
