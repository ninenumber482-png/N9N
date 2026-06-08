import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY
const TIMEOUT_MS = 15000

let supabaseInstance

if (supabaseUrl && supabaseKey) {
  try {
    const originalFetch = globalThis.fetch.bind(globalThis)
    const customFetch = (url, options = {}) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const signal = options.signal ? anySignal([options.signal, controller.signal]) : controller.signal
      const headers = { ...options.headers };
      try {
        const authRaw = localStorage.getItem('n9_auth');
        if (authRaw) {
          const auth = JSON.parse(authRaw);
          if (auth.token) headers['x-session-token'] = auth.token;
        }
      } catch {}
      return originalFetch(url, { ...options, headers, signal }).finally(() => clearTimeout(timer))
    }

    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      global: { fetch: customFetch },
      realtime: {
        enabled: true
      }
    })
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[supabase] client init failed:', e)
  }
}

function anySignal(signals) {
  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) { controller.abort(signal.reason); return controller.signal }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  return controller.signal
}

export const supabase = supabaseInstance

