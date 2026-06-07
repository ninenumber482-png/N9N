const CONFIG_CACHE_KEY = 'n9_cs_config'
const CONFIG_CACHE_TTL = 5 * 60 * 1000

export function getCsConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.ts > CONFIG_CACHE_TTL) return null
    return parsed.data
  } catch { return null }
}

export function setCsConfig(data) {
  try {
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* ignore */ }
}
