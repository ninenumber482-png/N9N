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

  fetchBalances: async () => {
    const auth = get().auth
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_KEY
    if (auth?.id && url && key) {
      try {
        if (!supabase) return
        const { data, error } = await supabase
          .from("wallet")
          .select("balance_main,balance_bonus")
          .eq("user_id", auth.id)
          .single()
        if (!error && data) {
          const main = Number(data.balance_main ?? 0)
          const bonus = Number(data.balance_bonus ?? 0)
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
