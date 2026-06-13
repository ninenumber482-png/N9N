import { DEMO_MODE } from "../helpers"

const APP_KEYS = ['n9_auth', 'n9_users', 'n9_users_by_uuid', 'n9_users_by_code', 'n9_cs_config']

export const configSlice = (set, get) => ({
  systemStatus: { kingStatus: 'OPEN', platformMaintenance: false, kingStatusMsg: '', platformMsg: '' },
  setSystemStatus: (status) => set({ systemStatus: status }),
  configReady: false,
  setConfigReady: (v) => set({ configReady: v }),

  systemNotification: null,
  clearSystemNotification: () => set({ systemNotification: null }),
  _hydrated: false,
  _setHydrated: (v) => set({ _hydrated: v }),

  isDemoMode: () => get()._demoMode ?? DEMO_MODE,
  setDemoMode: (enabled) => set({ _demoMode: enabled }),
  clearAllData: () => {
    APP_KEYS.forEach(k => localStorage.removeItem(k))
    const state = get()
    if (state.logout) state.logout()
    else {
      set({
        auth: null,
        users: {},
        availableBalance: 0,
        totalBalance: 0,
        lockedBalance: 0,
        referralBonus: 0,
        systemNotification: null,
        systemStatus: { kingStatus: 'OPEN', platformMaintenance: false, kingStatusMsg: '', platformMsg: '' },
      })
    }
  },
})
