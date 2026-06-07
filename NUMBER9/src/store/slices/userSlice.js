import { supabase } from "../../utils/supabase"
import { LS, ACCOUNT, LOGIN, REG, readJSON, writeJSON, generateRefCode, _fallbackProfile, _warn } from "../helpers"

export const userSlice = (set, get) => ({
  ACCOUNT,
  users: readJSON(LS.users, {}),
  refreshUsers: () => set({ users: readJSON(LS.users, {}) }),

  updateUser: (uuid, updates) => {
    const users = readJSON(LS.users, {})
    const byUuid = readJSON(LS.byUuid, {})
    if (byUuid[uuid]) {
      byUuid[uuid] = { ...byUuid[uuid], ...updates }
      const userKey = Object.keys(users).find(k => users[k].uuid === uuid)
      if (userKey) {
        users[userKey] = byUuid[uuid]
      }
      writeJSON(LS.users, users)
      writeJSON(LS.byUuid, byUuid)
      set({ users })
    }
  },

  getUserByUuid: (uuid) => {
    const byUuid = readJSON(LS.byUuid, {})
    return byUuid[uuid] || null
  },

  getUserByUsername: (username) => {
    const users = readJSON(LS.users, {})
    return users[String(username || "").toLowerCase()] || null
  },

  findUserByReferralCodeAsync: async (code) => {
    const norm = String(code || "").trim().toUpperCase()
    if (!norm) return null
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_KEY}`,
          },
          body: JSON.stringify({ validateOnly: true, referralCode: norm }),
          signal: controller.signal,
        }
      )
      clearTimeout(timeout)
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.ok && body.upline) {
        const u = body.upline
        return { uuid: u.uuid, username: u.username, displayName: u.displayName, referralCode: u.referralCode }
      }
    } catch (e) {
      _warn('findUserByReferralCodeAsync failed', e)
    }
    return null
  },

  findUserByReferralCode: (code) => {
    const norm = String(code || "").trim().toUpperCase()
    if (!norm) return null
    const byCode = readJSON(LS.byCode, {})
    const uuid = byCode[norm]
    if (!uuid) return null
    const byUuid = readJSON(LS.byUuid, {})
    const username = byUuid[uuid]
    if (!username) return null
    const users = readJSON(LS.users, {})
    const u = users[username]
    return u && u.account_status === "ACTIVE" ? u : null
  },

  fetchProfile: async () => {
    const authData = readJSON(LS.auth, null)
    if (!authData?.id) return null
    try {
      if (!supabase) return _fallbackProfile(authData)
      const { data, error } = await supabase.rpc('get_my_full_profile')
      if (error) {
        if (error.message?.includes('UNAUTHORIZED') || error.code === 'PGRST301') return null
        return _fallbackProfile(authData)
      }
      if (!data) return _fallbackProfile(authData)
      return data
    } catch (e) {
      _warn('fetchProfile failed', e)
      return _fallbackProfile(authData)
    }
  },

  fetchDownlines: async () => {
    const authData = readJSON(LS.auth, null)
    if (!authData?.id) return []
    try {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('users')
        .select('id,username,display_name,account_status,registration_status,created_at')
        .eq('referred_by_user', authData.id)
        .order('created_at', { ascending: false })
      if (error) { return [] }
      return (data || []).map(u => ({
        uuid: u.id,
        username: u.username,
        displayName: u.display_name,
        account_status: u.account_status,
        registration_status: u.registration_status,
        createdAt: u.created_at,
      }))
    } catch (e) {
      _warn('fetchDownlines failed', e)
      return []
    }
  },

  getUserByCode: (code) => {
    const byCode = readJSON(LS.byCode, {})
    return byCode[code] || null
  },

  approveUser: (uuid) => {
    const byUuid = readJSON(LS.byUuid, {})
    const username = byUuid[uuid]
    if (!username) return
    const users = readJSON(LS.users, {})
    const user = users[username]
    if (!user) return
    const updates = { registration_status: REG.APPROVED, account_status: "ACTIVE", login_status: LOGIN.ACTIVE, kyc_status: "APPROVED" }
    if (!user.referralCode) {
      const code = generateRefCode()
      updates.referralCode = code
      const byCode = readJSON(LS.byCode, {})
      byCode[code] = uuid
      writeJSON(LS.byCode, byCode)
    }
    get().updateUser(uuid, updates)
  },

  rejectUser: (uuid) => {
    const user = get().getUserByUuid(uuid)
    if (user) {
      get().updateUser(uuid, { registration_status: REG.REJECTED })
    }
  },

  lockUser: (uuid) => {
    const user = get().getUserByUuid(uuid)
    if (user) {
      get().updateUser(uuid, { login_status: LOGIN.LOCKED })
    }
  },

  unlockUser: (uuid) => {
    const user = get().getUserByUuid(uuid)
    if (user) {
      get().updateUser(uuid, { login_status: LOGIN.ACTIVE })
    }
  },
})
