/**
 * Parse a Postgres/ISO timestamp string as UTC and return epoch ms.
 *
 * PostgREST returns `timestamp` (without time zone) columns with NO offset
 * suffix (e.g. "2026-06-12T22:35:00.23"). `new Date(str)` would interpret those
 * as *local* time, which is wrong by the browser's UTC offset (e.g. +7h in WIB)
 * and makes freshness/age checks badly off. We append 'Z' when no offset is
 * present so the epoch is correct. Returns 0 for empty/invalid input.
 */
export function utcMs(s?: string | null): number {
  if (!s) return 0;
  let v = s.includes('T') ? s : s.replace(' ', 'T');
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) v += 'Z';
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}
