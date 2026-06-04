/**
 * Session heartbeat — sends a ping to Supabase to update last_activity
 * and device fingerprint on the user's session.
 *
 * Runs every 30 seconds while the tab is active.
 * Uses the existing x-user-token for auth (RLS bypass via anon key).
 */
import { supabase } from '../utils/supabase';
import { getFingerprint } from '../utils/fingerprint';

let _timer = null;
let _fingerprint = null;

async function ping() {
  if (!supabase) return;
  try {
    if (!_fingerprint) {
      _fingerprint = await getFingerprint();
    }
    // Use RPC to update session (bypasses RLS via SECURITY DEFINER)
    await supabase.rpc('session_heartbeat', { p_fingerprint: _fingerprint || null });
  } catch { /* ignore */ }
}

export function startHeartbeat(_userId) { // eslint-disable-line no-unused-vars
  stopHeartbeat();
  _fingerprint = null;
  // Initial ping immediately
  ping();
  // Then every 30s
  _timer = setInterval(ping, 30000);
}

export function stopHeartbeat() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
