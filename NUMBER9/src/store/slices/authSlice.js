import { startHeartbeat, stopHeartbeat } from "../../utils/heartbeat"
import { LS, REG, LOGIN, readJSON, writeJSON, _warn } from "../helpers"

export const authSlice = (set, get) => ({
  auth: readJSON(LS.auth, null),
  REG, LOGIN,

  setAuth: (data) => {
    data ? writeJSON(LS.auth, data) : localStorage.removeItem(LS.auth)
    set({ auth: data })
  },

  login: async (username, password) => {
    const uname = String(username || "").trim().toLowerCase()
    const pwd = String(password || "").trim()
    if (!uname || !pwd) return { ok: false, error: "Enter username and password." }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      let res
      try {
        res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_KEY}` },
            credentials: "include",
            body: JSON.stringify({ username: uname, password: pwd }),
            signal: controller.signal,
          }
        )
      } finally {
        clearTimeout(timeout)
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.pending) {
          return { ok: false, error: body.error || "Account not approved yet.", pending: true, displayName: body.display_name }
        }
        if (res.status === 429) {
          const retryAfter = res.headers.get("Retry-After")
          const msg = retryAfter ? `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.` : "Terlalu banyak percobaan. Coba lagi nanti."
          return { ok: false, error: msg, rateLimited: true }
        }
        if (res.status >= 500) {
          return { ok: false, error: "Layanan sedang tidak tersedia. Coba beberapa saat lagi." }
        }
        return { ok: false, error: body.error || "Login failed." }
      }

      const respData = await res.json()
      const user = respData.user
      if (!user?.id) {
        return { ok: false, error: "Invalid server response." }
      }

      const authData = {
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        role: user.role || "user",
        token: respData.token || "",
        loggedInAt: new Date().toISOString(),
        bankName: user.bank_name || "",
        bankAccountNumber: user.bank_account_number || "",
        bankAccountName: user.bank_account_name || "",
      }
      writeJSON(LS.auth, authData)
      set({ auth: authData })

      await get().fetchBalances()
      get().subscribeToWalletUpdates()

      try {
        const prof = await get().fetchProfile()
        if (prof) {
          const users = readJSON(LS.users, {})
          const byUuid = readJSON(LS.byUuid, {})
          const key = prof.username.toLowerCase()
          users[key] = prof
          byUuid[prof.uuid] = { ...prof, username: key }
          writeJSON(LS.users, users)
          writeJSON(LS.byUuid, byUuid)
          set({ users: { ...users } })
        }
        get().subscribeToProfileUpdates()
      } catch (e) {
        _warn('login: save profile failed', e)
      }

      startHeartbeat(user.id)

      return { ok: true }
    } catch (e) {
      _warn('login failed', e)
      if (e?.name === 'AbortError') {
        return { ok: false, error: "Server tidak merespon (timeout 15s). Coba lagi." }
      }
      if (e instanceof TypeError) {
        return { ok: false, error: "Tidak dapat terhubung ke server. Periksa koneksi internet." }
      }
      return { ok: false, error: "Connection error. Please try again." }
    }
  },

  logout: () => {
    stopHeartbeat()
    get().unsubscribeFromWalletUpdates()
    get().unsubscribeFromProfileUpdates()

    localStorage.removeItem(LS.auth)
    localStorage.removeItem(LS.users)
    localStorage.removeItem(LS.byUuid)
    localStorage.removeItem(LS.byCode)

    set({
      auth: null,
      availableBalance: 0,
      totalBalance: 0,
      lockedBalance: 0,
      referralBonus: 0,
      systemNotification: null,
    })
  },

  registerUser: async (data) => {
    const uname = String(data.username || "").trim().toLowerCase()
    if (!uname) return { ok: false, error: "Username is required." }
    if (!data.referralCode) return { ok: false, error: "Referral code is required." }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            username: uname,
            password: data.password,
            displayName: data.displayName,
            email: data.email || "",
            phone: data.phone || "",
            country: data.country || "Indonesia",
            referralCode: data.referralCode,
            bankName: data.bankName || "",
            bankAccountNumber: data.bankAccountNumber || "",
            bankAccountName: data.bankAccountName || "",
            kyc: data.kyc || {},
          }),
        }
      )

      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.error) {
        return { ok: false, error: body.error || "Registration failed." }
      }
      return {
        ok: true,
        user: body.user,
        message: body.message || "Registration successful. Awaiting admin approval.",
      }
    } catch (e) {
      _warn('registerUser failed', e)
      return { ok: false, error: "Registration failed. Please try again." }
    }
  },

  completeRegistration: async (uuid, data) => {
    if (!uuid) return { ok: false, error: "UUID is required." }
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_KEY}`,
          },
          body: JSON.stringify({ step: 2, uuid, ...data }),
        }
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.error) {
        return { ok: false, error: body.error || "Registration completion failed." }
      }
      return { ok: true, message: body.message || "Registration completed." }
    } catch (e) {
      _warn('completeRegistration failed', e)
      return { ok: false, error: "Connection error. Please try again." }
    }
  },

  register: async (username, password, displayName, email) => {
    return get().registerUser({ username, password, displayName, email })
  },
})
