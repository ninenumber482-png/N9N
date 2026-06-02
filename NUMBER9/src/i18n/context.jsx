/* eslint-disable no-empty */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { id } from './id'
import { en } from './en'

const LS_KEY = 'n9_lang'

const detect = () => {
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved === 'id' || saved === 'en') return saved
  } catch {}
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('id') ? 'id' : 'en'
}

const all = { id, en }

const CTX = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detect)

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, lang) } catch {}
  }, [lang])

  const setLang = useCallback((l) => setLangState(l), [])

  const t = useCallback((key, vars) => {
    const keys = key.split('.')
    let val = all[lang]
    for (const k of keys) {
      if (val == null) return key
      val = val[k]
    }
    if (val == null) return key
    if (typeof val === 'string') {
      return val.replace(/\{(\w+)\}/g, (_, k) => vars?.[k] != null ? String(vars[k]) : `{${k}}`)
    }
    return String(val)
  }, [lang])

  return <CTX.Provider value={{ t, lang, setLang }}>{children}</CTX.Provider>
}

export const useI18n = () => useContext(CTX)
export { CTX }
