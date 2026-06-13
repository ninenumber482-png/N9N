import { create } from "zustand"
import { supabase } from "../utils/supabase"
import { startHeartbeat } from "../utils/heartbeat"
import { LS, readJSON, writeJSON, DEMO_MODE, _warn } from "./helpers"
import { authSlice } from "./slices/authSlice"
import { userSlice } from "./slices/userSlice"
import { balanceSlice } from "./slices/balanceSlice"
import { configSlice } from "./slices/configSlice"

export const useStore = create((set, get) => ({
  ...authSlice(set, get),
  ...userSlice(set, get),
  ...balanceSlice(set, get),
  ...configSlice(set, get),
  _demoMode: DEMO_MODE,
}))

export const isDemoMode = () => useStore.getState()._demoMode ?? DEMO_MODE
export let setDemoMode = (enabled) => {
  useStore.setState({ _demoMode: enabled })
}

// Bootstrapper: auto-login + cross-tab sync on page load
let _storageListenerAdded = false
let _storageHandler = null
{
  const _auth = readJSON(LS.auth, null)
  if (_auth?.id && _auth?.username) {
    const loggedInAt = _auth.loggedInAt ? new Date(_auth.loggedInAt).getTime() : 0
    const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - loggedInAt > SESSION_MAX_MS) {
      writeJSON(LS.auth, null)
      useStore.setState({ auth: null })
    } else {
      if (!supabase) { localStorage.removeItem(LS.auth); useStore.setState({ auth: null }) }
      ;(async () => {
        if (!supabase) return
        const sessionId = _auth.id
        const stillValid = () => useStore.getState().auth?.id === sessionId

        if (typeof globalThis !== 'undefined' && globalThis.addEventListener && !_storageListenerAdded) {
          _storageHandler = (e) => {
            if (e.key === LS.auth) {
              try {
                const next = e.newValue ? JSON.parse(e.newValue) : null
                if (next?.id) {
                  useStore.setState({ auth: next })
                } else {
                  useStore.setState({ auth: null })
                }
              } catch { /* ignore */ }
            }
          }
          globalThis.addEventListener('storage', _storageHandler)
          _storageListenerAdded = true
        }

        useStore.getState().fetchProfile().then(prof => {
          if (!stillValid()) return
          if (!prof) {
            if (typeof window !== 'undefined') {
              ;(async () => {
                try {
                  const { data, error } = await supabase.rpc('get_my_wallet')
                  if (error || !data || data.error === 'NO_SESSION') {
                    if (import.meta.env.DEV) console.warn('[AUTH] Session stale. Forcing re-login.')
                    useStore.setState({
                      systemNotification: {
                        type: 'warning',
                        title: 'Session Expired',
                        message: 'Your session has expired. Please log in again.',
                      },
                    })
                    writeJSON(LS.auth, null)
                    useStore.setState({ auth: null })
                  }
                } catch { /* ignore */ }
              })()
            }
            return
          }

          if (prof.login_status === 'LOCKED' || prof.account_status === 'SUSPENDED') {
            writeJSON(LS.auth, null)
            useStore.setState({ auth: null })
            return
          }

          const users = { ...readJSON(LS.users, {}) }
          const byUuid = { ...readJSON(LS.byUuid, {}) }
          const key = prof.username.toLowerCase()
          users[key] = prof
          byUuid[prof.uuid] = { ...prof, username: key }
          writeJSON(LS.users, users)
          writeJSON(LS.byUuid, byUuid)
          useStore.setState({ users })
        }).catch((e) => { _warn('auto-login fetchProfile failed', e) })

        if (!stillValid()) return
        startHeartbeat(_auth.id)
      })()
    }
  }
}

export const cleanupStorageListener = () => {
  if (_storageHandler) {
    globalThis.removeEventListener('storage', _storageHandler)
    _storageHandler = null
    _storageListenerAdded = false
  }
}
