export function wib(iso, opts) {
  if (!iso) return '—'
  if (typeof iso === 'string' && !/(Z|[+-]\d{2}:\d{2})$/.test(iso)) {
    iso += 'Z'
  }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', ...opts })
}

export function wibDate(iso) {
  return wib(iso, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function wibDateTime(iso) {
  return wib(iso, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

export function wibTime() {
  return new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}
