import { supabase } from "../../utils/supabase"
import { _warn } from "../helpers"

export const balanceSlice = (set, get) => ({
  totalBalance: 0,
  setTotalBalance: (balance) => set({ totalBalance: balance }),
  availableBalance: 0,
  setAvailableBalance: (balance) => set({ availableBalance: balance }),
  lockedBalance: 0,
  setLockedBalance: (balance) => set({ lockedBalance: balance }),
  referralBonus: 0,
  setReferralBonus: (bonus) => set({ referralBonus: bonus }),
  lastDepositAt: null,
  setLastDepositAt: (ts) => set({ lastDepositAt: ts }),

  walletSubscription: null,

  subscribeToWalletUpdates: () => {
    const auth = get().auth
    if (!auth?.id) return

    // Unsubscribe from existing subscription
    const existingSub = get().walletSubscription
    if (existingSub) {
      supabase.removeChannel(existingSub)
    }

    // Create new subscription for wallet updates
    const channel = supabase
      .channel(`wallet-updates-${auth.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallet',
          filter: `user_id=eq.${auth.id}`
        },
        (payload) => {
          _warn('Wallet update received', payload)
          // Refresh balances when wallet data changes
          get().fetchBalances()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          _warn('Subscribed to wallet updates')
        } else if (status === 'CHANNEL_ERROR') {
          _warn('Wallet subscription error')
        }
      })

    set({ walletSubscription: channel })
  },

  unsubscribeFromWalletUpdates: () => {
    const existingSub = get().walletSubscription
    if (existingSub) {
      supabase.removeChannel(existingSub)
      set({ walletSubscription: null })
    }
  },

  fetchBalances: async () => {
    const auth = get().auth
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_KEY
    if (auth?.id && url && key) {
      try {
        const fetchUrl = `${url}/functions/v1/get-user-wallet?user_id=${auth.id}`;
        const response = await fetch(fetchUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
        });
        const text = await response.text();
        let data;
        try { data = JSON.parse(text) } catch { data = null }
        if (response.ok && Array.isArray(data) && data.length > 0) {
          const wallet = data[0];
          const main = Number(wallet.balance_main ?? 0)
          const bonus = Number(wallet.balance_bonus ?? 0)
          try { localStorage.removeItem('n9_wallet_balances') } catch { /* ignore */ }
          set({
            totalBalance: main + bonus,
            availableBalance: main,
            lockedBalance: 0,
            referralBonus: bonus,
          })
          return
        }
      } catch (e) {
        _warn('fetchBalances failed', e)
      }
    }
    if (auth?.id) {
      set({ totalBalance: 0, availableBalance: 0, lockedBalance: 0, referralBonus: 0 })
    } else {
      set({ totalBalance: 0, availableBalance: 0, lockedBalance: 0, referralBonus: 0 })
    }
  },
})
