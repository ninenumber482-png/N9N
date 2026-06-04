/* ============================================================
   3D KING — server-backed data layer
   ------------------------------------------------------------
   Session TIMING is deterministic UTC (YYYYMMDDHHmm, 5-min slots) and
   is computed locally — it already matches the backend's session codes.

   BIDS and RESULTS are NOT generated client-side anymore. They come from
   the backend (the single source of truth shared with the admin console):
     GET /api/user/3dking/my-bets        → this user's bets (settled by engine)
     GET /api/user/3dking/results/history → published results
     POST /api/user/3dking/bets           → place bets (deducts real wallet)

   Call refreshKingData() on an interval to refresh the in-memory cache, then
   read it through the sync getters below (so existing call sites keep working).
   ============================================================ */


import { supabase } from '../utils/supabase';
import { useStore } from './useStore';

/* ---- Supabase backend (100% LIVE) ---- */
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_KEY;
const hasBackend = () => Boolean(SUPA_URL && SUPA_KEY);

/* The logged-in user's UUID — set by the GamePage so the data layer can scope
   bets and debit the right wallet. */
let _userId = null;
export function setKingUser(userId) { _userId = userId || null; }

/* Map a Supabase `king_results` row to the result shape the UI expects
   (digit1/2/3, resultTotal, resultNumber, bigSmall, oddEven). */
function mapResultRow(row) {
  return withDisplay({
    sessionCode: row.session_code,
    digit1: row.d1,
    digit2: row.d2,
    digit3: row.d3,
    resultTotal: row.total,
    resultNumber: row.total,
    bigSmall: row.big_small,
    oddEven: row.odd_even,
    settledAt: row.created_at,
  });
}

/* Map a Supabase `bets` row to the in-memory shape the UI already expects. */
function mapBetRow(row) {
  return withDisplay({
    clientBetId: row.id,
    id: row.id,
    sessionCode: row.session_code,
    betCode: row.bet_code,
    selection: row.selection,
    stake: Number(row.stake),
    potentialPayout: Number(row.potential_payout),
    payout: Number(row.actual_payout || 0),
    status: row.status,
    result: row.result,
    createdAt: row.created_at,
    placedAt: row.created_at,
  });
}


/* ---- timing constants (must match backend session scheme) ---- */
export const SESSION_DURATION_MS = 300_000; // 5 minutes between result times
export const BETTING_WINDOW_MS = 240_000; // 4:00 = OPEN
export const LOCKED_DURATION_MS = 60_000; // 1:00 = LOCKED (betting closes 1 min before draw; matches admin /3dking)
export const RESULTING_DURATION_MS = 3_000; // 0:03 = RESULTING
export const SETTLED_DURATION_MS = 7_000; // 0:07 = SETTLED

/* ---- bid groups & payouts ---- */
export const PAYOUT = { BIG_SMALL: 2, ODD_EVEN: 2, NUMBER: 3 };
export const BIG_SMALL = ["BIG", "SMALL"];
export const ODD_EVEN = ["ODD", "EVEN"];

const pad2 = (n) => String(n).padStart(2, "0");

/* Code is YYYYMMDDHHmm (the result / closing target time) - matches backend codeFromDate */
function codeFor(resultMs) {
  const d = new Date(resultMs);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const min = pad2(Math.floor(d.getUTCMinutes() / 5) * 5); // Round down to nearest 5 min
  return `${y}${m}${day}${h}${min}`;
}

/* Convert a UTC session code (YYYYMMDDHHmm) to the same instant expressed in
   WIB (Asia/Jakarta) digits — for DISPLAY only. The canonical sessionCode used
   for matching stays UTC. Mirrors the admin console's fmtSessionCodeWIB. */
export function toWIBCode(code) {
  if (!code || code.length < 12) return code;
  const y = Number(code.slice(0, 4));
  const mo = Number(code.slice(4, 6)) - 1;
  const d = Number(code.slice(6, 8));
  const h = Number(code.slice(8, 10));
  const mi = Number(code.slice(10, 12));
  const dt = new Date(Date.UTC(y, mo, d, h, mi));
  const parts = dt
    .toLocaleString("en-CA", { timeZone: "Asia/Jakarta", hour12: false })
    .split(/[-, :]+/);
  return parts[0] + parts[1] + parts[2] + parts[3] + parts[4];
}

/* Parse sessionCode (YYYYMMDDHHmm) → result timestamp (ms) */
function parseResultMs(sessionCode) {
  const year = Number(sessionCode.slice(0, 4));
  const month = Number(sessionCode.slice(4, 6)) - 1;
  const day = Number(sessionCode.slice(6, 8));
  const hour = Number(sessionCode.slice(8, 10));
  const minute = Number(sessionCode.slice(10, 12));
  return Date.UTC(year, month, day, hour, minute);
}

/* Get the NEXT session whose result time is >= nowMs. */
export function sessionAt(nowMs = Date.now()) {
  // Convert to UTC milliseconds for consistent timing with backend
  const now = new Date(nowMs);
  const nowUtcMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds()
  );
  
  let resultMs = Math.ceil(nowUtcMs / SESSION_DURATION_MS) * SESSION_DURATION_MS;
  if (nowUtcMs % SESSION_DURATION_MS === 0) {
    resultMs += SESSION_DURATION_MS;
  }

  const startMs = resultMs - SESSION_DURATION_MS; // betting opens here
  const lockMs = resultMs - LOCKED_DURATION_MS;
  const settleStartMs = resultMs + RESULTING_DURATION_MS;
  const endMs = resultMs + RESULTING_DURATION_MS + SETTLED_DURATION_MS;

  let status;
  if (nowUtcMs < lockMs) status = "OPEN";
  else if (nowUtcMs < resultMs) status = "LOCKED";
  else if (nowUtcMs < settleStartMs) status = "RESULTING";
  else status = "SETTLED";

  return {
    sessionCode: codeFor(resultMs),
    displayCode: "N9K-" + toWIBCode(codeFor(resultMs)),
    status,
    openTime: new Date(startMs),
    lockTime: new Date(lockMs),
    resultTime: new Date(resultMs),
    settleTime: new Date(settleStartMs),
    endTime: new Date(endMs),
    msToLock: Math.max(0, lockMs - nowUtcMs),
    msToResult: Math.max(0, resultMs - nowUtcMs),
    msToSettle: Math.max(0, settleStartMs - nowUtcMs),
    msToEnd: Math.max(0, endMs - nowUtcMs),
    msSinceOpen: Math.max(0, nowUtcMs - startMs),
  };
}

/* Get status of a specific sessionCode at a given absolute time */
export function sessionStatusAt(sessionCode, nowMs = Date.now()) {
  const resultMs = parseResultMs(sessionCode);
  const lockMs = resultMs - LOCKED_DURATION_MS;
  const settleStartMs = resultMs + RESULTING_DURATION_MS;
  const endMs = resultMs + RESULTING_DURATION_MS + SETTLED_DURATION_MS;

  if (nowMs < lockMs) return "OPEN";
  if (nowMs < resultMs) return "LOCKED";
  if (nowMs < settleStartMs) return "RESULTING";
  if (nowMs < endMs) return "SETTLED";
  return "ENDED";
}

/* Previous session = result time - 5 minutes */
export function getPreviousSessionCode(sessionCode) {
  const resultMs = parseResultMs(sessionCode);
  const prevResultMs = resultMs - SESSION_DURATION_MS;
  return codeFor(prevResultMs);
}

/* ------------------------------------------------------------------
   Server-backed cache (refreshed by refreshKingData)
   ------------------------------------------------------------------ */
let _bets = [];
let _results = [];

const withDisplay = (o) => ({ ...o, displayCode: "N9K-" + toWIBCode(o.sessionCode) });

/* Load this user's bets from Supabase (real persistence). Results come
   from Supabase king_results table. */
export async function refreshKingData(userId = _userId) {
  if (userId) _userId = userId;
  if (!hasBackend()) return { bets: _bets, results: _results };

  try {
    if (!supabase) return { bets: _bets, results: _results };
    const [resultsRes, betsRes] = await Promise.all([
      supabase.from("king_results").select("session_code,d1,d2,d3,total,big_small,odd_even,created_at").order("session_code", { ascending: false }).limit(100),
      userId
        ? supabase.from("bets").select("id,session_code,bet_code,selection,stake,potential_payout,actual_payout,status,result,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (!resultsRes.error) {
      const seen = new Set();
      _results = (resultsRes.data || []).map(mapResultRow).filter((r) => {
        if (seen.has(r.sessionCode)) return false;
        seen.add(r.sessionCode);
        return true;
      });
    }

    if (!betsRes.error) {
      _bets = (betsRes.data || []).map(mapBetRow);
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[king] refreshKingData failed:', e);
  }

  return { bets: _bets, results: _results };
}

/* ---- bids (read from cache; already scoped to the logged-in user) ---- */
export function listBids() {
  return _bets;
}

export function listBidsForSession(sessionCode) {
  return _bets.filter((b) => b.sessionCode === sessionCode);
}

/* ---- results (read from cache) ---- */
export function listSettledRecent(limit = 10) {
  /* deduplicate by sessionCode as a safety net (storage already deduped) */
  const seen = new Set();
  return _results.filter((r) => {
    if (seen.has(r.sessionCode)) return false;
    seen.add(r.sessionCode);
    return true;
  }).slice(0, limit);
}

export function getSettled(sessionCode) {
  return _results.find((r) => r.sessionCode === sessionCode) || null;
}

/* payout multiplier — identical to 3D King rules (2x line bets, 3x number). */
const isLineBet = (sel) => sel === "BIG" || sel === "SMALL" || sel === "ODD" || sel === "EVEN";
const payoutFor = (sel, stake) => stake * (isLineBet(sel) ? PAYOUT.BIG_SMALL : PAYOUT.NUMBER);
const codeFor3 = (sel) => (typeof sel === "number" ? `TOTAL_${sel}` : sel);

/* Place bids. Uses the server-side place_bet() RPC which atomically inserts bet
   rows, verifies the wallet balance, and debits the stake in a single transaction
   (SECURITY DEFINER, so it bypasses RLS). */
export async function placeBid({ sessionCode, selections, stake, username, userId = _userId }) {
  if (hasBackend() && userId) {
    try {
      if (!supabase) return { ok: false, error: "Backend unavailable. Cannot place bet." };

      const p_selections = selections.map((selection) => ({
        bet_code: codeFor3(selection),
        selection: String(selection),
        stake,
        potential_payout: payoutFor(selection, stake),
      }));

      const { data, error } = await supabase.rpc("place_bet", {
        p_user_id: userId,
        p_session_code: sessionCode,
        p_selections,
      });

      if (error) throw error;

      await refreshKingData(userId);
      // Bump _kingVersion so App.jsx polling observer (and any subscribers
      // listening on the store) notice that a new bet landed — otherwise
      // the 15s poll cycle would not see the new head-of-stream bet for
      // up to 15 seconds, and the local balance refresh would race.
      try { useStore.setState(s => ({ _kingVersion: (s._kingVersion || 0) + 1 })); } catch {}
      return { ok: true, count: selections.length };
    } catch (err) {
      return { ok: false, error: err?.message || "Bet failed. Please try again." };
    }
  }

  return { ok: false, error: "Backend unavailable. Cannot place bet." };
}
