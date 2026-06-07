export const _warn = (msg, e) => { if (import.meta.env.DEV) console.warn('[store]', msg, e); }

export const LS = {
  auth: "n9_auth",
  users: "n9_users",
  byUuid: "n9_users_by_uuid",
  byCode: "n9_users_by_code",
}

export const REG = {
  PENDING: "PENDING_VERIFICATION",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
}
export const LOGIN = { LOCKED: "LOCKED", ACTIVE: "ACTIVE", SUSPENDED: "SUSPENDED" }
export const ACCOUNT = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  REJECTED: "REJECTED",
}

export const DEMO_MODE = false

export const readJSON = (k, fallback) => {
  try {
    const r = localStorage.getItem(k)
    return r ? JSON.parse(r) : fallback
  } catch {
    return fallback
  }
}

export const writeJSON = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch (e) {
    _warn('writeJSON failed', e)
  }
}

export const generateRefCode = () => {
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase()
  return `N9-USER-${rand}`
}

export function _fallbackProfile(authData) {
  return {
    uuid: authData.id, id: authData.id,
    username: authData.username, displayName: authData.displayName,
    email: authData.email || '', phone: authData.phone || '',
    country: authData.country || '',
    bankName: authData.bankName || '', bankAccountNumber: authData.bankAccountNumber || '', bankAccountName: authData.bankAccountName || '',
    createdAt: authData.createdAt || '',
  }
}
