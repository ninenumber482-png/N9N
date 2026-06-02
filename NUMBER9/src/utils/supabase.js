import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

let globalUserToken = null

let supabaseInstance

if (supabaseUrl && supabaseKey) {
  try {
    // Create client with custom fetch that injects x-user-token header.
    // NOTE: supabase-js v2 reads the custom fetch from `global.fetch` — a
    // top-level `fetch` key is silently ignored, which previously meant
    // x-user-token was never sent (breaking token-required RPCs like place_bet).
    const originalFetch = globalThis.fetch.bind(globalThis)
    const customFetch = (url, options = {}) => {
      const headers = new Headers(options.headers || {})
      if (globalUserToken) {
        headers.set('x-user-token', globalUserToken)
      }
      return originalFetch(url, { ...options, headers })
    }

    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      global: { fetch: customFetch }
    })
  } catch (e) {
    console.warn('[NUMBER9] Failed to create Supabase client:', e?.message)
  }
} else {
  console.warn('[NUMBER9] Supabase credentials not configured. Using localStorage fallback.')
}

export const supabase = supabaseInstance

/**
 * Set or clear the x-user-token header on the Supabase client.
 * This header is used by RLS policies to identify the logged-in React app user.
 */
export function setUserToken(token) {
  globalUserToken = token
  console.info('[NUMBER9] ✅ User token set, x-user-token header will be included in all requests')
}

// Test connection
export async function testConnection() {
  try {
    const { error } = await supabase
      .from('users')
      .select('count', { count: 'exact' })
      .limit(1)

    if (error) {
      console.error('[NUMBER9] Supabase connection failed:', error)
      return false
    }

    console.log('[NUMBER9] ✅ Supabase connection successful')
    return true
  } catch (err) {
    console.error('[NUMBER9] Supabase connection error:', err)
    return false
  }
}
