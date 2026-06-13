import { supabase } from './supabase';

/**
 * CS contact config — fetched via the LOGIN-ONLY RPC `get_cs_contact`.
 *
 * Why not get_public_config / localStorage: CS links must NOT be reachable by
 * anon users (brief: "non-login tidak boleh akses link CS"). The RPC requires a
 * valid x-user-token (injected by the supabase client for logged-in users) and
 * returns {error:'NO_SESSION'} otherwise. We also do NOT persist links to
 * localStorage — that avoids stale WA links lingering after admin turns a
 * channel off ("tidak ada cache lama"). Cache is in-memory only, per session.
 */

const LEGACY_CACHE_KEY = 'n9_cs_config'; // old localStorage key — purge if present
let _cache = null; // { ts, data } in-memory only
const TTL = 60 * 1000;

function normalize(cfg) {
  if (!cfg || cfg.error) return { waOk: false, tgOk: false, anyActive: false };
  const masterOff = cfg.cs_active === 'false';
  const welcome = cfg.cs_welcome_message || 'Hello, I need assistance.';

  // WhatsApp: digits-only number, guard against malformed/too-short values.
  const waNumber = (cfg.cs_wa_number || '').replace(/[^\d]/g, '');
  const waOk = !masterOff && cfg.cs_wa_active === 'true' && waNumber.length >= 8;
  const waHref = waOk ? `https://wa.me/${waNumber}?text=${encodeURIComponent(welcome)}` : null;

  // Telegram link must be a full t.me URL set by admin — never hardcoded here.
  const tgLink = cfg.cs_telegram_link || '';
  const tgOk = !masterOff && cfg.cs_telegram_active === 'true' && /^https:\/\/(t\.me|telegram\.me)\/.+/i.test(tgLink);
  const tgHref = tgOk ? tgLink : null;

  return {
    anyActive: waOk || tgOk,
    waOk,
    tgOk,
    waHref,
    tgHref,
    displayName: cfg.cs_display_name || 'Customer Service',
    welcome,
    avatar: cfg.cs_avatar_url || '',
  };
}

/** Fetch normalized CS contact config. Returns the inactive shape if not logged in. */
export async function fetchCsContact() {
  try {
    if (_cache && Date.now() - _cache.ts < TTL) return _cache.data;
    if (!supabase) return normalize(null);
    const { data, error } = await supabase.rpc('get_cs_contact');
    if (error) return normalize(null);
    const norm = normalize(data);
    _cache = { ts: Date.now(), data: norm };
    return norm;
  } catch {
    return normalize(null);
  }
}

/** Clear in-memory cache + purge any legacy localStorage CS config (call on logout). */
export function clearCsContact() {
  _cache = null;
  try {
    localStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
