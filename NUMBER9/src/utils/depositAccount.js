import { supabase } from './supabase';

/**
 * Deposit destination account — fetched ONLY on explicit user action ("Check /
 * Load System") via the login-gated `get_deposit_account` RPC. The account
 * number is never loaded on page render, never served to anon, and never
 * persisted to storage (memory-only in the calling component).
 * Returns { provider_name, account_holder, account_number, instructions } or { error }.
 */
export async function fetchDepositAccount() {
  try {
    if (!supabase) return { error: 'NETWORK' };
    const { data, error } = await supabase.rpc('get_deposit_account');
    if (error) return { error: error.message || 'LOAD_FAILED' };
    return data || { error: 'LOAD_FAILED' };
  } catch {
    return { error: 'NETWORK' };
  }
}
