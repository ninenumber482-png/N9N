/* eslint-disable no-empty */

/* ============================================================
   WALLET + TRANSACTIONS + TURNOVER + DEPOSIT LOCK
   100% SUPABASE SOURCE OF TRUTH — NO LOCALSTORAGE DEPENDENCY
   ============================================================ */

import { supabase } from "../utils/supabase";
import { DEPOSIT_LOCK_MS, WITHDRAWAL_LOCK_MS } from "../constants";

const now = () => new Date().toISOString();

/* ---------- platform accounts ---------- */
export async function fetchPlatformAccounts() {
  try {
    const { data, error } = await supabase
      .from('platform_accounts')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('created_at');
    if (!error && data?.length > 0) {
      return data.map(a => ({
        id: a.id,
        type: a.type === 'BANK' ? 'BANK_TRANSFER' : a.type === 'EWALLET' ? 'E_WALLET' : a.type,
        label: a.provider_name,
        name: a.account_holder,
        number: a.account_number,
        note: a.instructions || '',
      }));
    }
  } catch {
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
  } catch {
  }
  return { main: 0, bonus: 0, totalDeposited: 0, totalWithdrawn: 0, totalTurnover: 0 };
}

/* ---------- deposit lock ---------- */
export function getDepositLockRemaining(tx, now) {
  if (tx.status !== "PENDING" && tx.status !== "pending") return 0;
  if (tx.type !== "DEPOSIT" && tx.type !== "Deposit") return 0;
  const txTime = new Date(tx.requestedAt || tx.created_at).getTime();
  return Math.max(0, DEPOSIT_LOCK_MS - ((now || Date.now()) - txTime));
}
export function isDepositLocked(tx) { return getDepositLockRemaining(tx) > 0; }

/* ---------- withdrawal lock ---------- */
export function getWithdrawalLockRemaining(tx, now) {
  if (tx.status !== "PENDING" && tx.status !== "pending") return 0;
  if (tx.type !== "WITHDRAWAL" && tx.type !== "Withdrawal") return 0;
  const txTime = new Date(tx.requestedAt || tx.created_at).getTime();
  return Math.max(0, WITHDRAWAL_LOCK_MS - ((now || Date.now()) - txTime));
}
export function isWithdrawalLocked(tx) { return getWithdrawalLockRemaining(tx) > 0; }

/* ---------- turnover (Supabase-based) ---------- */
export async function checkWithdrawEligibility(userId) {
  try {
    // Only count deposits still LOCKED (turnover_applied < turnover_required)
    const { data: locks, error } = await supabase
      .from('deposit_locks')
      .select('turnover_required, turnover_applied')
      .eq('user_id', userId);

    if (error) {
      return { isUnlocked: false, required: 0, achieved: 0, remaining: 0 };
    }

    const lockedLocks = (locks || []).filter(r => Number(r.turnover_applied) < Number(r.turnover_required));
    const totalRequired = lockedLocks.reduce((s, r) => s + Number(r.turnover_required), 0);
    const totalApplied = lockedLocks.reduce((s, r) => s + Number(r.turnover_applied), 0);
    const remaining = Math.max(0, totalRequired - totalApplied);
    const isUnlocked = remaining <= 0;
    return { isUnlocked, required: totalRequired, achieved: totalApplied, remaining };
  } catch {
    return { isUnlocked: false, required: 0, achieved: 0, remaining: 0 };
  }
}

const newIdempotencyKey = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

export async function requestDeposit(params) {
  const amt = Number(params.amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: "Enter a positive amount." };

  try {
    const proofUrl = await uploadProof(params.userUuid, params.proof);
    const idempotencyKey = newIdempotencyKey();

    const { data, error } = await supabase.rpc('submit_deposit', {
      p_user_id: params.userUuid,
      p_amount: amt,
      p_method: params.method || 'Transfer Bank',
      p_proof_image_url: proofUrl || null,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      if (error.code === '23505') {
        return { ok: false, error: "Deposit already pending (duplicate detected)" };
      }
      return { ok: false, error: "Failed to create deposit request" };
    }

    return { ok: true, tx: { id: data?.id, amount: amt, status: 'PENDING', requestedAt: data?.created_at } };
  } catch (e) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

async function uploadProof(userUuid, base64DataUrl) {
  if (!base64DataUrl || !base64DataUrl.startsWith('data:')) return null;
  try {
    // Storage RLS can't see our custom x-user-token identity, so direct uploads are
    // rejected. The upload-proof Edge Function verifies the token server-side and
    // uploads with the service role into proofs/<userId>/. (userUuid is enforced
    // server-side from the token, not trusted from the client.)
    const { data, error } = await supabase.functions.invoke('upload-proof', {
      body: { dataUrl: base64DataUrl, kind: 'deposit' },
    });
    if (error) { return null; }
    return data?.url || null;
  } catch {
    return null;
  }
}

export async function requestWithdraw(params) {
  const amt = Number(params.amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: "Enter a positive amount." };

  try {
    // Check turnover eligibility before allowing withdrawal
    const eligibility = await checkWithdrawEligibility(params.userUuid);
    if (!eligibility.isUnlocked) {
      return { ok: false, error: `Withdraw locked. Turnover remaining: ${eligibility.remaining.toLocaleString()} P.` };
    }

    // Check balance
    const wallet = await fetchWalletBalance(params.userUuid);
    if (amt > wallet.main) {
      return { ok: false, error: "Insufficient main balance." };
    }

    const idempotencyKey = newIdempotencyKey();
    const { data, error } = await supabase.rpc('submit_withdrawal', {
      p_user_id: params.userUuid,
      p_amount: amt,
      p_method: params.method || 'Bank Transfer',
      p_bank_name: params.bankName || null,
      p_bank_account_number: params.bankAccountNumber || null,
      p_bank_account_name: params.bankAccountName || null,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      if (error.code === '23505') {
        return { ok: false, error: "Withdrawal already pending (duplicate)" };
      }
      return { ok: false, error: "Failed to create withdrawal request" };
    }

    return { ok: true, tx: { id: data?.id, amount: amt, status: 'PENDING', requestedAt: data?.created_at } };
  } catch (e) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

/* ── Realtime subscriptions ───────────────────────────────────────────────── */
let _realtimeChannel = null;

/* ── Supabase-based data fetchers ────────────────────────────────────────── */

export async function fetchUserBank(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('bank_name,bank_account_number,bank_account_name')
      .eq('id', userId)
      .single();
    if (!error && data) return {
      bankName: data.bank_name || '',
      bankAccountNumber: data.bank_account_number || '',
      bankAccountName: data.bank_account_name || '',
    };
  } catch {}
  return { bankName: '', bankAccountNumber: '', bankAccountName: '' };
}

export async function fetchTurnoverSummary(userId) {
  try {
    const walletRes = await supabase
      .from('wallet')
      .select('total_deposited, total_turnover')
      .eq('user_id', userId)
      .single();

    const totalDeposited = Number(walletRes.data?.total_deposited ?? 0);
    const totalTurnover = Number(walletRes.data?.total_turnover ?? 0);

    // Only count deposits still LOCKED (turnover_applied < turnover_required)
    const { data: locks } = await supabase
      .from('deposit_locks')
      .select('turnover_required, turnover_applied')
      .eq('user_id', userId);

    const lockedLocks = (locks || []).filter(r => Number(r.turnover_applied) < Number(r.turnover_required));
    const totalRequired = lockedLocks.reduce((s, r) => s + Number(r.turnover_required), 0);
    const totalApplied = lockedLocks.reduce((s, r) => s + Number(r.turnover_applied), 0);
    const remaining = totalRequired - totalApplied;
    const pct = totalRequired > 0 ? Math.min(100, Math.round((totalApplied / totalRequired) * 100)) : 0;
    return { required: totalRequired, achieved: totalApplied, remaining, pct, totalDeposited, totalTurnover, isUnlocked: remaining <= 0 };
  } catch {
    return { required: 0, achieved: 0, remaining: 0, pct: 0, totalDeposited: 0, totalTurnover: 0, isUnlocked: true };
  }
}

export async function fetchUserTransactions(userId, limit = 100) {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,reference_code,type,amount,status,method,bank_name,bank_account_number,bank_account_name,proof_image_url,created_at,processed_at,notes')
      .eq('user_id', userId)
      .in('type', ['DEPOSIT', 'WITHDRAWAL'])
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error && data) return data.map(t => {
      const mapped = {
        id: t.id,
        referenceCode: t.reference_code || t.id.slice(0, 8).toUpperCase(),
        type: t.type === 'WITHDRAWAL' ? 'WITHDRAW' : t.type,
        amount: Number(t.amount),
        status: t.status === 'COMPLETED' ? 'APPROVED' : t.status === 'FAILED' ? 'REJECTED' : t.status,
        method: t.method || '',
        bankName: t.bank_name || '',
        bankAccountNumber: t.bank_account_number || '',
        bankAccountName: t.bank_account_name || '',
        proof: t.proof_image_url || '',
        requestedAt: t.created_at,
        processedAt: t.processed_at,
        notes: t.notes,
      };
      return mapped;
    });
  } catch {}
  return [];
}

export async function subscribeWalletRealtime(userUuid, username, onWalletUpdate, onTxUpdate) {
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
  try {
    _realtimeChannel = supabase
      .channel(`wallet_rt_${userUuid}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'wallet',
        filter: `user_id=eq.${userUuid}`,
      }, payload => {
        const w = payload.new;
        const main = Number(w.balance_main ?? 0);
        const bonus = Number(w.balance_bonus ?? 0);
        onWalletUpdate?.(main, bonus);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${userUuid}`,
      }, payload => {
        const tx = payload.new;
        onTxUpdate?.(tx);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${userUuid}`,
      }, payload => {
        const tx = payload.new;
        onTxUpdate?.(tx);
      })
      .subscribe();
  } catch {
  }
}

export function unsubscribeWalletRealtime() {
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}


