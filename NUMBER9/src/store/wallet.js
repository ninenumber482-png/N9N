/* eslint-disable no-empty */
import { supabase } from '../utils/supabase';
import { apiSelect, apiSelectAll, apiRpc, apiInvoke } from '../utils/api';
import { DEPOSIT_LOCK_MS } from '../constants';
import { formatNumber } from '../utils/format';

const _warn = (msg, e) => {
  if (import.meta.env.DEV) console.warn('[wallet]', msg, e);
};

/* ---------- platform accounts ---------- */
export async function fetchPlatformAccounts() {
  try {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('platform_accounts')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('created_at');

    if (error) {
      _warn('fetchPlatformAccounts error', error);
      return [];
    }
    if (!data || data.length === 0) return [];

    return data.map((a) => ({
      id: a.id,
      type: a.type === 'BANK' ? 'BANK_TRANSFER' : a.type === 'EWALLET' ? 'E_WALLET' : a.type,
      label: a.provider_name,
      name: a.account_holder,
      number: a.account_number,
      note: a.instructions || '',
    }));
  } catch (e) {
    _warn('fetchPlatformAccounts exception', e);
  }
  return [];
}

/* ---------- wallet balance ---------- */
export async function fetchWalletBalance(userId) {
  try {
    const { data, error } = await supabase
      .from('wallet')
      .select('balance_main, balance_bonus, total_deposited, total_withdrawn, total_turnover')
      .eq('user_id', userId)
      .single();
    if (!error && data) {
      return {
        main: Number(data.balance_main ?? 0),
        bonus: Number(data.balance_bonus ?? 0),
        totalDeposited: Number(data.total_deposited ?? 0),
        totalWithdrawn: Number(data.total_withdrawn ?? 0),
        totalTurnover: Number(data.total_turnover ?? 0),
      };
    }
  } catch (e) {
    _warn('fetchWalletBalance failed', e);
  }
  return { main: 0, bonus: 0, totalDeposited: 0, totalWithdrawn: 0, totalTurnover: 0 };
}

/* ---------- deposit lock (15 min auto-lock, then admin confirmation window) ---------- */
export function isPendingDeposit(tx) {
  if (!tx) return false;
  const type = String(tx.type || '').toUpperCase();
  const status = String(tx.status || '').toUpperCase();
  return type === 'DEPOSIT' && status === 'PENDING';
}

/** Parse Supabase/Postgres timestamps reliably (avoid instant "expired" on Safari). */
export function parseDepositTimestamp(raw) {
  if (!raw) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:/.test(s)) {
    s = `${s.replace(' ', 'T')}Z`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d/.test(s) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    s = `${s}Z`;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

export function getDepositTxTime(tx) {
  const t = parseDepositTimestamp(tx?.requestedAt || tx?.created_at);
  // Invalid/missing → treat as just submitted (full 15 min lock, never skip to admin msg)
  return Number.isFinite(t) ? t : Date.now();
}

export function getDepositLockRemaining(tx, now) {
  if (!isPendingDeposit(tx)) return 0;
  const nowMs = now || Date.now();
  const elapsed = nowMs - getDepositTxTime(tx);
  if (!Number.isFinite(elapsed) || elapsed < 0) return DEPOSIT_LOCK_MS;
  return Math.max(0, DEPOSIT_LOCK_MS - elapsed);
}

export function getPendingDeposits(txs) {
  return (txs || []).filter(isPendingDeposit);
}

/** True if ANY pending deposit is still inside the 15-minute lock window. */
export function hasDepositInLock(txs, now) {
  return getPendingDeposits(txs).some((t) => getDepositLockRemaining(t, now) > 0);
}

/** Max lock remaining across pending deposits (+ optional client fallback ms). */
export function getMaxDepositLockRemaining(txs, now, fallbackMs = 0) {
  const fromTxs = getPendingDeposits(txs).map((t) => getDepositLockRemaining(t, now));
  const maxTx = fromTxs.length ? Math.max(...fromTxs) : 0;
  return Math.max(maxTx, fallbackMs > 0 ? fallbackMs : 0);
}

/** Admin message only when no deposit is in the 15-min lock (all pending past window). */
export function getDepositsAwaitingAdmin(txs, now) {
  if (hasDepositInLock(txs, now)) return [];
  return getPendingDeposits(txs);
}

/** @deprecated use getDepositsAwaitingAdmin */
export function isDepositAwaitingAdmin(tx, now) {
  return isPendingDeposit(tx) && getDepositLockRemaining(tx, now) <= 0;
}

/* ---------- withdrawal lock ---------- */

/* ---------- turnover (Supabase-based) ---------- */
export async function checkWithdrawEligibility(userId) {
  try {
    // Same logic as submit_withdrawal gate — SECURITY DEFINER RPC (single source of truth).
    const data = await apiRpc('check_turnover_eligibility', { p_user_id: userId });
    if (!data || typeof data !== 'object') {
      return { isUnlocked: false, required: 0, achieved: 0, remaining: 0 };
    }
    return {
      isUnlocked: Boolean(data.is_unlocked),
      required: Number(data.required ?? 0),
      achieved: Number(data.achieved ?? 0),
      remaining: Number(data.remaining ?? 0),
    };
  } catch (e) {
    _warn('checkWithdrawEligibility failed', e);
    return { isUnlocked: false, required: 0, achieved: 0, remaining: 0 };
  }
}

/* crypto.randomUUID() is universally available in modern browsers
   (all targets in Vite's browserslist) — no fallback needed. */
const newIdempotencyKey = () => crypto.randomUUID();

export async function requestDeposit(params) {
  const amt = Number(params.amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'Enter a positive amount.' };

  try {
    const proofUrl = await uploadProof(params.userUuid, params.proof);
    if (params.proof && !proofUrl) return { ok: false, error: 'Bukti gagal diupload. Cek koneksi dan coba lagi.' };
    const idempotencyKey = newIdempotencyKey();

    const data = await apiInvoke('submit-deposit-wrapper', {
      p_user_id: params.userUuid,
      p_amount: amt,
      p_method: params.method || 'Transfer Bank',
      p_proof_image_url: proofUrl || null,
      p_idempotency_key: idempotencyKey,
    });

    if (!data?.id) {
      return { ok: false, error: data?.message || data?.error || 'Deposit gagal. Coba lagi.' };
    }

    return {
      ok: true,
      tx: { id: data.id, amount: amt, status: 'PENDING', requestedAt: data.created_at || new Date().toISOString() },
    };
  } catch (e) {
    const msg = e?.message || 'Network error';
    if (msg.includes('MAINTENANCE_MODE'))
      return { ok: false, error: 'Platform sedang maintenance. Deposit tidak dapat diproses.' };
    if (msg.includes('23505') || msg.includes('DEPOSIT_ALREADY_PENDING'))
      return { ok: false, error: 'Anda masih punya deposit pending. Tunggu konfirmasi admin.' };
    if (msg.includes('UNAUTHORIZED') || msg.includes('Sesi habis'))
      return { ok: false, error: 'Sesi habis, silakan login ulang.' };
    return { ok: false, error: msg || 'Gagal membuat deposit.' };
  }
}

async function uploadProof(userUuid, base64DataUrl) {
  if (!base64DataUrl || !base64DataUrl.startsWith('data:')) return null;
  try {
    const data = await apiInvoke('upload-proof', { dataUrl: base64DataUrl, kind: 'deposit' });
    return data?.url || null;
  } catch (e) {
    _warn('uploadProof failed', e);
    return null;
  }
}

export async function requestWithdraw(params) {
  const amt = Number(params.amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'Enter a positive amount.' };

  try {
    // Check turnover eligibility before allowing withdrawal
    const eligibility = await checkWithdrawEligibility(params.userUuid);
    if (!eligibility.isUnlocked) {
      return { ok: false, error: `Withdraw locked. Turnover remaining: ${formatNumber(eligibility.remaining)} P.` };
    }

    const idempotencyKey = newIdempotencyKey();
    const data = await apiInvoke('submit-withdrawal-wrapper', {
      p_user_id: params.userUuid,
      p_amount: amt,
      p_method: params.method || 'Bank Transfer',
      p_bank_name: params.bankName || null,
      p_bank_account_number: params.bankAccountNumber || null,
      p_bank_account_name: params.bankAccountName || null,
      p_idempotency_key: idempotencyKey,
    });

    return { ok: true, tx: { id: data?.id, amount: amt, status: 'PENDING', requestedAt: data?.created_at } };
  } catch (e) {
    const msg = e?.message || 'Network error';
    if (msg.includes('MAINTENANCE_MODE'))
      return { ok: false, error: 'Platform sedang maintenance. Withdrawal tidak dapat diproses.' };
    if (msg.includes('23505')) return { ok: false, error: 'Withdrawal already pending (duplicate)' };
    if (msg.includes('INSUFFICIENT_BALANCE')) return { ok: false, error: 'Saldo utama tidak mencukupi.' };
    if (msg.includes('TURNOVER_NOT_MET')) return { ok: false, error: 'Turnover belum terpenuhi.' };
    if (msg.includes('UNAUTHORIZED')) return { ok: false, error: 'Sesi habis, silakan login ulang.' };
    return { ok: false, error: msg };
  }
}

/* ── Supabase-based data fetchers ────────────────────────────────────────── */

export async function updateUserBank(userId, bankName, bankAccountNumber, bankAccountName) {
  try {
    await apiRpc('update_user_bank', {
      p_user_id: userId,
      p_bank_name: bankName || null,
      p_bank_account_number: bankAccountNumber || null,
      p_bank_account_name: bankAccountName || null,
    });
  } catch (e) {
    _warn('updateUserBank failed', e);
  }
}

export async function fetchUserBank(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('bank_name,bank_account_number,bank_account_name')
      .eq('id', userId)
      .single();
    if (!error && data)
      return {
        bankName: data.bank_name || '',
        bankAccountNumber: data.bank_account_number || '',
        bankAccountName: data.bank_account_name || '',
      };
  } catch (e) {
    _warn('fetchUserBank failed', e);
  }
  return { bankName: '', bankAccountNumber: '', bankAccountName: '' };
}

export async function fetchTurnoverSummary(userId) {
  try {
    const data = await apiInvoke('get-turnover-summary', { userId });
    if (!data) return defaultTurnover();
    return {
      required: Number(data.required ?? 0),
      achieved: Number(data.achieved ?? 0),
      remaining: Number(data.remaining ?? 0),
      pct: Number(data.pct ?? 0),
      totalDeposited: Number(data.totalDeposited ?? 0),
      locks: Array.isArray(data.locks)
        ? data.locks.map((l) => ({
            amount: Number(l.amount ?? 0),
            required: Number(l.required ?? 0),
            applied: Number(l.applied ?? 0),
            remaining: Number(l.remaining ?? 0),
            pct: Number(l.pct ?? 0),
            done: Boolean(l.done),
          }))
        : [],
      isUnlocked: Boolean(data.isUnlocked),
    };
  } catch (e) {
    _warn('fetchTurnoverSummary failed', e);
    return defaultTurnover();
  }
}

function defaultTurnover() {
  return { required: 0, achieved: 0, remaining: 0, pct: 100, totalDeposited: 0, locks: [], isUnlocked: false };
}

export async function fetchUserTransactions(userId, limit = 100) {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'id,reference_code,type,amount,status,method,bank_name,bank_account_number,bank_account_name,proof_image_url,created_at,processed_at,notes',
      )
      .eq('user_id', userId)
      .in('type', ['DEPOSIT', 'WITHDRAWAL'])
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error && data)
      return data
        .map((t) => {
          if (!t?.id) return null;
          const idStr = String(t.id);
          return {
            id: t.id,
            referenceCode:
              t.reference_code ||
              (t.type === 'DEPOSIT' ? 'DEP-' : t.type === 'WITHDRAWAL' ? 'WTH-' : 'TXN-') +
                (idStr.length >= 8 ? idStr.slice(0, 8).toUpperCase() : idStr.toUpperCase()),
            type: t.type === 'WITHDRAWAL' ? 'WITHDRAW' : t.type,
            amount: Number(t.amount ?? 0),
            status: t.status === 'COMPLETED' ? 'APPROVED' : t.status === 'FAILED' ? 'REJECTED' : t.status || 'PENDING',
            method: t.method || '',
            bankName: t.bank_name || '',
            bankAccountNumber: t.bank_account_number || '',
            bankAccountName: t.bank_account_name || '',
            proof: t.proof_image_url || '',
            requestedAt: t.created_at || new Date().toISOString(),
            processedAt: t.processed_at,
            notes: t.notes,
          };
        })
        .filter(Boolean);
  } catch (e) {
    _warn('fetchUserTransactions failed', e);
  }
  return [];
}
