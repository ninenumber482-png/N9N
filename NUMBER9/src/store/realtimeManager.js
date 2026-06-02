/* ============================================================
   REALTIME MANAGER — Centralized Subscription Orchestration
   ============================================================

   All realtime subscriptions are managed here with explicit
   error handling and lifecycle cleanup. Subscriptions are tied
   to auth lifecycle (subscribe on login, cleanup on logout).
*/

let _walletChannel = null;
let _userStatusChannel = null;
let _platformConfigChannel = null;
let _settledBetsChannel = null;

async function supa() {
  const { supabase } = await import('../utils/supabase.js');
  return supabase;
}

/* ---- Wallet + Transactions ---- */
export async function subscribeToWalletAndTransactions(
  userId,
  onWalletUpdate,  // (main, bonus) => void
  onTxUpdate,      // (tx) => void
  onError          // (error) => void (optional)
) {
  if (!userId) return () => {};

  try {
    const supabase = await supa();

    _walletChannel = supabase.channel(`wallet_rt_${userId}`);

    _walletChannel
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'wallet',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const { balance_main, balance_bonus } = payload.new;
        onWalletUpdate?.(Number(balance_main || 0), Number(balance_bonus || 0));
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        onTxUpdate?.(payload.new);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'transactions',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        onTxUpdate?.(payload.new);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[NUMBER9] Wallet realtime subscription error:', status);
          onError?.(new Error(`Wallet subscription ${status}`));
        }
      });

    return () => {
      if (_walletChannel) {
        supabase.removeChannel(_walletChannel);
        _walletChannel = null;
      }
    };
  } catch (e) {
    console.error('[NUMBER9] subscribeToWalletAndTransactions error:', e?.message);
    onError?.(e);
    return () => {};
  }
}

/* ---- User Status (login_status, account_status, registration_status) ---- */
export async function subscribeToUserStatus(
  userId,
  onStatusChange,  // (profile) => void — called with updated user profile
  onError          // (error) => void (optional)
) {
  if (!userId) return () => {};

  try {
    const supabase = await supa();

    _userStatusChannel = supabase.channel(`user-status-${userId}`);

    _userStatusChannel
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `id=eq.${userId}`,
      }, (payload) => {
        const newStatus = payload.new;

        // If account locked or suspended → trigger logout via callback
        if (newStatus.login_status === 'LOCKED' || newStatus.account_status === 'SUSPENDED') {
          onStatusChange?.({ ...newStatus, _shouldLogout: true });
          return;
        }

        // If registration approved → show notification
        if (payload.old?.registration_status !== 'APPROVED' && newStatus.registration_status === 'APPROVED') {
          onStatusChange?.({ ...newStatus, _approved: true });
          return;
        }

        onStatusChange?.(newStatus);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[NUMBER9] User status subscription error:', status);
          onError?.(new Error(`User status subscription ${status}`));
        }
      });

    return () => {
      if (_userStatusChannel) {
        _userStatusChannel.unsubscribe();
        _userStatusChannel = null;
      }
    };
  } catch (e) {
    console.error('[NUMBER9] subscribeToUserStatus error:', e?.message);
    onError?.(e);
    return () => {};
  }
}

/* ---- Platform Config (marketplace status, maintenance mode, etc) ---- */
export async function subscribeToPlatformConfig(
  onConfigChange,  // (config: { key, value }) => void
  onError          // (error) => void (optional)
) {
  try {
    const supabase = await supa();

    _platformConfigChannel = supabase.channel('platform_config');

    _platformConfigChannel
      .on('postgres_changes', {
        event: '*',  // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'platform_config',
      }, (payload) => {
        const { key, value } = payload.new || {};
        onConfigChange?.({ key, value, event: payload.eventType });
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[NUMBER9] Platform config subscription error:', status);
          onError?.(new Error(`Platform config subscription ${status}`));
        }
      });

    return () => {
      if (_platformConfigChannel) {
        _platformConfigChannel.unsubscribe();
        _platformConfigChannel = null;
      }
    };
  } catch (e) {
    console.error('[NUMBER9] subscribeToPlatformConfig error:', e?.message);
    onError?.(e);
    return () => {};
  }
}

/* ---- Settled Bets (realtime result updates) ---- */
export async function subscribeToSettledBets(
  userId,
  onBetUpdate,   // (bet) => void — called when a bet settles (status changes to SETTLED)
  onError        // (error) => void (optional)
) {
  if (!userId) return () => {};

  try {
    const supabase = await supa();

    _settledBetsChannel = supabase.channel(`bets_settled_${userId}`);

    _settledBetsChannel
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bets',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const bet = payload.new;
        // Only notify on settlement (PENDING → SETTLED transition)
        if (payload.old?.status === 'PENDING' && bet.status === 'SETTLED') {
          onBetUpdate?.(bet);
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[NUMBER9] Settled bets subscription error:', status);
          onError?.(new Error(`Settled bets subscription ${status}`));
        }
      });

    return () => {
      if (_settledBetsChannel) {
        _settledBetsChannel.unsubscribe();
        _settledBetsChannel = null;
      }
    };
  } catch (e) {
    console.error('[NUMBER9] subscribeToSettledBets error:', e?.message);
    onError?.(e);
    return () => {};
  }
}

/* ---- Master Cleanup ---- */
export async function unsubscribeAll() {
  try {
    const supabase = await supa();

    if (_walletChannel) {
      supabase.removeChannel(_walletChannel);
      _walletChannel = null;
    }
    if (_userStatusChannel) {
      await _userStatusChannel.unsubscribe();
      _userStatusChannel = null;
    }
    if (_platformConfigChannel) {
      await _platformConfigChannel.unsubscribe();
      _platformConfigChannel = null;
    }
    if (_settledBetsChannel) {
      await _settledBetsChannel.unsubscribe();
      _settledBetsChannel = null;
    }
  } catch (e) {
    console.error('[NUMBER9] unsubscribeAll error:', e?.message);
  }
}
