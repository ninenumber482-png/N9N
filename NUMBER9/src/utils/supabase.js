import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

let globalUserToken = null

let supabaseInstance
export let realtimeEnabled = false

if (supabaseUrl && supabaseKey) {
  try {
    // Create client with custom fetch that injects x-user-token header.
    // NOTE: supabase-js v2 reads the custom fetch from `global.fetch` — a
    // top-level `fetch` key is silently ignored, which previously meant
    // x-user-token was never sent (breaking token-required RPCs like place_bet).
    const originalFetch = globalThis.fetch.bind(globalThis)
    const AUTH_LS_KEY = 'n9_auth'
    const customFetch = (url, options = {}) => {
      const headers = new Headers(options.headers || {})
      // ALWAYS read from localStorage on every request so multi-tab logins
      // stay in sync. Previously this read globalUserToken (set once) which
      // became stale when another tab re-logged-in or admin reset the session,
      // causing RLS to block ALL queries silently (manifesting as "no turnover"
      // or empty data even when DB has rows).
      let token = null
      try {
        const raw = globalThis.localStorage?.getItem(AUTH_LS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          token = parsed?.token || null
        }
      } catch { /* ignore */ }
      // Fallback to in-memory (for code paths that set it explicitly via setUserToken)
      if (!token && globalUserToken) token = globalUserToken
      if (token) {
        headers.set('x-user-token', token)
      }
      return originalFetch(url, { ...options, headers })
    }

    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      global: { fetch: customFetch },
      realtime: {
        // Disable realtime WebSocket — service is down (Cloudflare error 1101)
        // Polling fallback is used instead via periodic refresh
        enabled: false
      }
    })
    realtimeEnabled = false // must match realtime.enabled above
  } catch { /* ignore */ }
}

export const supabase = supabaseInstance

/**
 * Set or clear the x-user-token header on the Supabase client.
 * This header is used by RLS policies to identify the logged-in React app user.
 */
export function setUserToken(token) {
  globalUserToken = token
}

