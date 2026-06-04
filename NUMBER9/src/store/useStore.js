/* eslint-disable no-empty */
import { supabase, setUserToken, realtimeEnabled } from "../utils/supabase";
import { create } from "zustand";
import { subscribeWalletRealtime, unsubscribeWalletRealtime } from "./wallet";
import { startHeartbeat, stopHeartbeat } from "../utils/heartbeat";

/* ============================================================
   NUMBER9 — Dashboard global store (MINIMAL FUNCTIONAL VERSION)
   Restored after auditService cleanup - full version in backup
   ============================================================ */

const LS = {
  auth: "n9_auth",
  users: "n9_users",
  byUuid: "n9_users_by_uuid",
  byCode: "n9_users_by_code",
};

const REG = {
  PENDING: "PENDING_VERIFICATION",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};
const LOGIN = { LOCKED: "LOCKED", ACTIVE: "ACTIVE", SUSPENDED: "SUSPENDED" };
const ACCOUNT = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  REJECTED: "REJECTED",
};

const readJSON = (k, fallback) => {
  try {
    const r = localStorage.getItem(k);
    return r ? JSON.parse(r) : fallback;
  } catch {
    return fallback;
  }
};

const writeJSON = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

const now = () => new Date().toISOString();

const generateRefCode = () => {
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `N9-USER-${rand}`;
};

const DEMO_MODE = false;

const getDefaultUsers = () => ({});

/* ---------- store ---------- */
export const useStore = create((set, get) => ({
  REG, LOGIN, ACCOUNT,
  systemStatus: { kingStatus: 'OPEN', platformMaintenance: false, kingStatusMsg: '', platformMsg: '' },
  setSystemStatus: (status) => set({ systemStatus: status }),

  subscribePlatformConfig: () => {
    if (DEMO_MODE) return () => {};
    if (!realtimeEnabled) return () => {};
    let channel;
    const setup = async () => {
      try {
        if (!supabase) return;
        channel = supabase
          .channel('platform_config')
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'platform_config',
          }, (payload) => {
            const { key, value } = payload.new || {};

            set(s => {
              const updates = { ...s.systemStatus };
              if (key === 'king_status') updates.kingStatus = value || 'OPEN';
              if (key === 'king_status_msg') updates.kingStatusMsg = value || '';
              if (key === 'platform_maintenance') updates.platformMaintenance = value === 'true' || value === true;
              if (key === 'platform_msg') updates.platformMsg = value || '';

              return { systemStatus: updates };
            });
          })
          .subscribe();
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[store] platform config subscription failed:', e);
      }
    };
    setup();
    return () => { if (channel) channel.unsubscribe(); };
  },

  syncPlatformConfig: async () => {
    try {
      if (!supabase) return;
      const { data: config, error } = await supabase
        .from('platform_config')
        .select('key, value')
        .in('key', ['king_status', 'king_status_msg', 'platform_maintenance', 'platform_msg']);

      if (!error && config) {
        const updates = {};
        config.forEach(item => {
          if (item.key === 'king_status') updates.kingStatus = item.value || 'OPEN';
          if (item.key === 'king_status_msg') updates.kingStatusMsg = item.value || '';
          if (item.key === 'platform_maintenance') updates.platformMaintenance = item.value === 'true' || item.value === true;
          if (item.key === 'platform_msg') updates.platformMsg = item.value || '';
        });
        if (Object.keys(updates).length > 0) {
          set(s => ({ systemStatus: { ...s.systemStatus, ...updates } }));
        }
      }
    } catch {}
  },
  systemNotification: null,
  clearSystemNotification: () => set({ systemNotification: null }),
  _hydrated: false,
  _setHydrated: (v) => set({ _hydrated: v }),

  /* REALTIME — subscribe to user status changes */
  subscribeUserStatus: (userId) => {
    if (!userId || DEMO_MODE) return () => {};
    if (!realtimeEnabled) return () => {};
    let channel;
    const setup = async () => {
      try {
        if (!supabase) return;
        channel = supabase
          .channel('user-status-' + userId)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: 'id=eq.' + userId,
          }, (payload) => {
            const newStatus = payload.new;

            // If account locked or suspended → auto logout
            if (newStatus.login_status === 'LOCKED' || newStatus.account_status === 'SUSPENDED') {
              set({
                systemNotification: {
                  type: 'warning',
                  title: 'Account Suspended',
                  message: 'Your account has been locked or suspended. Please contact support.',
                },
              });
              get().logout();
              return;
            }

            // Notify any subscribers (e.g. ProfilePage) so they can re-pull
            // the latest user data. The payload already contains the new
            // row, so subscribers can merge selectively without a refetch.
            try {
              const handlers = get()._userChangeHandlers;
              if (handlers && handlers.size > 0) {
                handlers.forEach((fn) => {
                  try { fn(newStatus); } catch {}
                });
              }
            } catch {}

            // If registration approved → show notification
            const oldStatus = payload.old?.registration_status;
            if (oldStatus !== 'APPROVED' && newStatus.registration_status === 'APPROVED') {
              set({
                systemNotification: {
                  type: 'approved',
                  title: 'Account Approved!',
                  message: 'Your account has been approved by the administrator. You now have full access.',
                },
              });
              // Refresh auth data so next navigation works
              const authData = readJSON(LS.auth, null);
              if (authData) {
                authData._refreshed = Date.now();
                writeJSON(LS.auth, authData);
                set({ auth: authData });
              }
            }
          })
          .subscribe();
      } catch {
        // Supabase not available
      }
    };
    setup();
    return () => { if (channel) channel.unsubscribe(); };
  },

  /* AUTH */
  auth: readJSON(LS.auth, null),
  setAuth: (data) => {
    data ? writeJSON(LS.auth, data) : localStorage.removeItem(LS.auth);
    set({ auth: data });
  },

  login: async (username, password) => {
    const uname = String(username || "").trim().toLowerCase();
    if (!uname || !password) return { ok: false, error: "Enter username and password." };

    try {
      // Call user-login Edge Function (server-side bcrypt validation)
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_KEY}` },
          body: JSON.stringify({ username: uname, password }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.pending) {
          return { ok: false, error: body.error || "Account not approved yet.", pending: true, displayName: body.display_name };
        }
        return { ok: false, error: body.error || "Login failed." };
      }

      const { user, session } = await res.json();
      if (!user?.id || !session?.access_token) {
        return { ok: false, error: "Invalid server response." };
      }

      const authData = {
        id: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        role: user.role || "user",
        token: session.access_token,
        loggedInAt: new Date().toISOString(),
        email: user.email || "",
        phone: user.phone || "",
      };
      writeJSON(LS.auth, authData);
      set({ auth: authData });

      // Set x-user-token header for all subsequent Supabase requests (RLS)
      setUserToken(session.access_token);

      // Fetch initial balances (main, reserved, buying power) for immediate UI display
      await get().fetchBalances();

      subscribeWalletRealtime(user.id, uname,
        () => get().fetchBalances(),
        (tx) => {
          set(s => ({ _rtTick: (s._rtTick || 0) + 1 }));
          // Show notification for approved deposits
          if (tx.type === 'DEPOSIT' && tx.status === 'COMPLETED') {
            set({
              systemNotification: {
                type: 'deposit_approved',
                title: 'Deposit Approved',
                message: `+${Number(tx.amount || 0).toLocaleString()} P has been credited to your wallet.`,
              },
            });
          }
          // Show notification for rejected deposits
          if (tx.type === 'DEPOSIT' && (tx.status === 'REJECTED' || tx.status === 'FAILED')) {
            set({
              systemNotification: {
                type: 'deposit_rejected',
                title: 'Deposit Rejected',
                message: `Your deposit of ${Number(tx.amount || 0).toLocaleString()} P was rejected.`,
              },
            });
          }
          // Show notification for approved withdrawals
          if (tx.type === 'WITHDRAWAL' && tx.status === 'COMPLETED') {
            set({
              systemNotification: {
                type: 'withdraw_approved',
                title: 'Withdrawal Complete',
                message: `${Number(tx.amount || 0).toLocaleString()} P has been withdrawn.`,
              },
            });
          }
          // Show notification for rejected withdrawals
          if (tx.type === 'WITHDRAWAL' && (tx.status === 'REJECTED' || tx.status === 'FAILED')) {
            set({
              systemNotification: {
                type: 'withdraw_rejected',
                title: 'Withdrawal Rejected',
                message: `Your withdrawal of ${Number(tx.amount || 0).toLocaleString()} P was rejected.`,
              },
            });
          }
        }
      );

      // Save user profile to localStorage (so getUserByUsername works)
      try {
        const prof = await get().fetchProfile();
        if (prof) {
          const users = readJSON(LS.users, {});
          const byUuid = readJSON(LS.byUuid, {});
          const key = prof.username.toLowerCase();
          users[key] = prof;
          byUuid[prof.uuid] = { ...prof, username: key };
          writeJSON(LS.users, users);
          writeJSON(LS.byUuid, byUuid);
          set({ users: { ...users } });
        }
      } catch {}

      // Start session heartbeat (updates last_activity + fingerprint)
      startHeartbeat(user.id);

      return { ok: true };
    } catch {
      return { ok: false, error: "Connection error. Please try again." };
    }
  },

  logout: () => {
    stopHeartbeat();
    unsubscribeWalletRealtime();

    // Clear localStorage
    localStorage.removeItem(LS.auth);
    localStorage.removeItem(LS.users);
    localStorage.removeItem(LS.byUuid);
    localStorage.removeItem(LS.byCode);

    // Clear all session state atomically
    set({
      auth: null,
      availableBalance: 0,
      totalBalance: 0,
      lockedBalance: 0,
      referralBonus: 0,
      systemNotification: null,
    });

    setUserToken(null);
  },

  registerUser: async (data) => {
    const uname = String(data.username || "").trim().toLowerCase();
    if (!uname) return { ok: false, error: "Username is required." };
    if (!data.referralCode) return { ok: false, error: "Referral code is required." };

    try {
      // Registration runs server-side (user-register Edge Function, service role):
      // RLS on `users` blocks anon referral lookup + insert, so the client cannot
      // do this directly. The edge fn validates the referral code, hashes the
      // password, creates the user/wallet/KYC docs atomically.
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            username: uname,
            password: data.password,
            displayName: data.displayName,
            email: data.email || "",
            phone: data.phone || "",
            country: data.country || "Indonesia",
            referralCode: data.referralCode,
            bankName: data.bankName || "",
            bankAccountNumber: data.bankAccountNumber || "",
            bankAccountName: data.bankAccountName || "",
            kyc: data.kyc || {},
          }),
        }
      );

      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        return { ok: false, error: body.error || "Registration failed." };
      }
      return {
        ok: true,
        user: body.user,
        message: body.message || "Registration successful. Awaiting admin approval.",
      };
    } catch {
      return { ok: false, error: "Registration failed. Please try again." };
    }
  },

  register: async (username, password, displayName, email) => {
    return get().registerUser({ username, password, displayName, email });
  },

  /* USER MANAGEMENT */
  users: readJSON(LS.users, {}),
  refreshUsers: () => set({ users: readJSON(LS.users, {}) }),

  updateUser: (uuid, updates) => {
    const users = readJSON(LS.users, {});
    const byUuid = readJSON(LS.byUuid, {});
    if (byUuid[uuid]) {
      byUuid[uuid] = { ...byUuid[uuid], ...updates };
      const userKey = Object.keys(users).find(k => users[k].uuid === uuid);
      if (userKey) {
        users[userKey] = byUuid[uuid];
      }
      writeJSON(LS.users, users);
      writeJSON(LS.byUuid, byUuid);
      set({ users });
    }
  },

  getUserByUuid: (uuid) => {
    const byUuid = readJSON(LS.byUuid, {});
    return byUuid[uuid] || null;
  },

  getUserByUsername: (username) => {
    const users = readJSON(LS.users, {});
    return users[String(username || "").toLowerCase()] || null;
  },

  findUserByReferralCodeAsync: async (code) => {
    const norm = String(code || "").trim().toUpperCase();
    if (!norm) return null;
    try {
      // Referral preview during registration. RLS on `users` blocks anon lookups,
      // so resolve via the user-register Edge Function (service role, validateOnly).
      // Handles both personal user codes and admin-generated system codes.
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_KEY}`,
          },
          body: JSON.stringify({ validateOnly: true, referralCode: norm }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok && body.upline) {
        const u = body.upline;
        return { uuid: u.uuid, username: u.username, displayName: u.displayName, referralCode: u.referralCode };
      }
    } catch {}
    return null;
  },

  findUserByReferralCode: (code) => {
    const norm = String(code || "").trim().toUpperCase();
    if (!norm) return null;
    const byCode = readJSON(LS.byCode, {});
    const uuid = byCode[norm];
    if (!uuid) return null;
    const byUuid = readJSON(LS.byUuid, {});
    const username = byUuid[uuid];
    if (!username) return null;
    const users = readJSON(LS.users, {});
    const u = users[username];
    return u && u.account_status === "ACTIVE" ? u : null;
  },

  fetchProfile: async () => {
    const authData = readJSON(LS.auth, null);
    if (!authData?.id) return null;
    try {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('users')
        .select('id,username,display_name,email,phone,country,role,account_status,registration_status,login_status,bank_name,bank_account_number,bank_account_name,kyc_status,referral_code,referred_by,created_at,approved_at')
        .eq('id', authData.id)
        .single();
      if (!error && data) {
        // referred_by holds a referrals.id (the code used at signup) — same model
        // as the Angular admin (users?referred_by=eq.<referrals.id>). Resolve it to
        // the human-readable referral code so the UI shows "N9PLATFORM", not a UUID.
        let referredByCode = null;
        if (data.referred_by) {
          const { data: ref } = await supabase
            .from('referrals')
            .select('code')
            .eq('id', data.referred_by)
            .maybeSingle();
          referredByCode = ref?.code || null;
        }
        return {
          uuid: data.id,
          username: data.username,
          displayName: data.display_name,
          email: data.email,
          phone: data.phone,
          country: data.country,
          role: data.role,
          account_status: data.account_status,
          registration_status: data.registration_status,
          login_status: data.login_status,
          bankName: data.bank_name,
          bankAccountNumber: data.bank_account_number,
          bankAccountName: data.bank_account_name,
          kyc_status: data.kyc_status,
          referralCode: data.referral_code,
          referredByUuid: data.referred_by,
          referredByCode,
          createdAt: data.created_at,
          approvedAt: data.approved_at,
        };
      }
    } catch {}
    return null;
  },

  // Direct downline = users who registered with me as their referrer (referred_by_user).
  // Queried from the DB, not the local users cache (which only holds locally-seen users).
  fetchDownlines: async () => {
    const authData = readJSON(LS.auth, null);
    if (!authData?.id) return [];
    try {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('users')
        .select('id,username,display_name,account_status,registration_status,created_at')
        .eq('referred_by_user', authData.id)
        .order('created_at', { ascending: false });
      if (error) { return []; }
      return (data || []).map(u => ({
        uuid: u.id,
        username: u.username,
        displayName: u.display_name,
        account_status: u.account_status,
        registration_status: u.registration_status,
        createdAt: u.created_at,
      }));
    } catch {
      return [];
    }
  },

  getUserByCode: (code) => {
    const byCode = readJSON(LS.byCode, {});
    return byCode[code] || null;
  },

  approveUser: (uuid) => {
    const byUuid = readJSON(LS.byUuid, {});
    const username = byUuid[uuid];
    if (!username) return;
    const users = readJSON(LS.users, {});
    const user = users[username];
    if (!user) return;
    const updates = { registration_status: REG.APPROVED, account_status: "ACTIVE", login_status: LOGIN.ACTIVE, kyc_status: "APPROVED" };
    if (!user.referralCode) {
      const code = generateRefCode();
      updates.referralCode = code;
      const byCode = readJSON(LS.byCode, {});
      byCode[code] = uuid;
      writeJSON(LS.byCode, byCode);
    }
    get().updateUser(uuid, updates);
  },

  rejectUser: (uuid) => {
    const user = get().getUserByUuid(uuid);
    if (user) {
      get().updateUser(uuid, { registration_status: REG.REJECTED });
    }
  },

  lockUser: (uuid) => {
    const user = get().getUserByUuid(uuid);
    if (user) {
      get().updateUser(uuid, { login_status: LOGIN.LOCKED });
    }
  },

  unlockUser: (uuid) => {
    const user = get().getUserByUuid(uuid);
    if (user) {
      get().updateUser(uuid, { login_status: LOGIN.ACTIVE });
    }
  },

  /* BALANCE & WALLET */
  totalBalance: 0,
  setTotalBalance: (balance) => set({ totalBalance: balance }),
  availableBalance: 0,
  setAvailableBalance: (balance) => set({ availableBalance: balance }),
  lockedBalance: 0,
  setLockedBalance: (balance) => set({ lockedBalance: balance }),

  /* USER CHANGE LISTENERS — registered by ProfilePage etc to react to
     realtime row updates from subscribeUserStatus() without doing a
     full refetch (the new row is in the payload). */
  _userChangeHandlers: new Set(),
  onUserChange: (fn) => {
    const set = get()._userChangeHandlers;
    set.add(fn);
    return () => set.delete(fn);
  },
  referralBonus: 0,
  setReferralBonus: (bonus) => set({ referralBonus: bonus }),
  lastDepositAt: null,
  setLastDepositAt: (ts) => set({ lastDepositAt: ts }),
  fetchBalances: async () => {
    const auth = get().auth;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_KEY;
    // Real wallet from Supabase when we have credentials + a logged-in UUID
    if (auth?.id && url && key) {
      try {
        if (!supabase) return;
        const { data, error } = await supabase
          .from("wallet")
          .select("balance_main,balance_bonus")
          .eq("user_id", auth.id)
          .single();
        if (!error && data) {
          const main = Number(data.balance_main) ?? 0;
          const bonus = Number(data.balance_bonus) ?? 0;
          // Since 20260604170000: submit_withdrawal ATOMICALLY deducts balance_main
          // at submission. So balance_main already reflects money in-flight
          // (deducted, waiting for admin to bank-transfer). No "reserved" sub-bucket
          // exists in DB — pending WDs do not reserve additional funds on top of main.
          //
          //   Portfolio (totalBalance)  = main + bonus
          //   Available (spendable)     = main
          //   Locked                    = 0 (no escrow sub-bucket)
          try { localStorage.removeItem('n9_wallet_balances'); } catch {}
          set({
            totalBalance: main + bonus,    // Portfolio Value (main + bonus)
            availableBalance: main,         // Spendable = balance_main
            lockedBalance: 0,               // No separate reserved bucket
            referralBonus: bonus,
          });
          return;
        }
      } catch {
        // fall through to zero balances
      }
    }
    // Fallback: 0 if logged in (will be refreshed by Realtime)
    if (auth?.id) {
      set({ totalBalance: 0, availableBalance: 0, lockedBalance: 0, referralBonus: 0 });
    } else {
      set({ totalBalance: 0, availableBalance: 0, lockedBalance: 0, referralBonus: 0 });
    }
  },

  /* DEMO MODE */
  isDemoMode: () => DEMO_MODE,
  setDemoMode: () => {},
  clearAllData: () => {
    localStorage.clear();
    set({ auth: null, users: {}, availableBalance: 0 });
  },
}));

export const isDemoMode = () => DEMO_MODE;
export const setDemoMode = () => {};
export const clearAllData = () => {
  // Only clear NUMBER9 keys, not all localStorage
  const n9Keys = ['n9_auth', 'n9_users', 'n9_users_by_uuid', 'n9_users_by_code'];
  n9Keys.forEach(k => localStorage.removeItem(k));
  useStore.setState({ auth: null, users: {}, availableBalance: 0 });
};

// Auto-subscribe Realtime + sync profile on page load if user already logged in
{
  const _auth = readJSON(LS.auth, null);
  if (_auth?.id && _auth?.username && _auth?.token) {
    const loggedInAt = _auth.loggedInAt ? new Date(_auth.loggedInAt).getTime() : 0;
    const SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - loggedInAt > SESSION_MAX_MS) {
      writeJSON(LS.auth, null);
      useStore.setState({ auth: null });
    } else {
      if (!supabase) { useStore.setState({ auth: null }); }
      (async () => {
        if (!supabase) return;
        // Abort signal: capture the session ID at start; if the user logs
        // out (or another tab changes auth) before this chain completes,
        // the `stillValid` check below short-circuits so we don't subscribe
        // realtime channels / fire notifications on a dead session.
        const sessionId = _auth.id;
        const stillValid = () => useStore.getState().auth?.id === sessionId;
        setUserToken(_auth.token);
        // Cross-tab sync: when another tab logs in/out, sync this tab's in-memory token.
        // This prevents stale globalUserToken from blocking RLS queries.
        if (typeof globalThis !== 'undefined' && globalThis.addEventListener) {
          globalThis.addEventListener('storage', (e) => {
            if (e.key === LS.auth) {
              try {
                const next = e.newValue ? JSON.parse(e.newValue) : null;
                if (next?.token) {
                  setUserToken(next.token);
                  useStore.setState({ auth: next });
                } else {
                  setUserToken(null);
                  useStore.setState({ auth: null });
                }
              } catch {}
            }
          });
        }
        useStore.getState().fetchProfile().then(prof => {
          if (!stillValid()) return; // user logged out / switched session mid-fetch
          if (!prof) {
            // Token may be stale (RLS blocks all reads). Cross-check by attempting
            // a low-cost wallet query — if that also returns null, the session
            // token in localStorage is out-of-sync with users.session_token.
            // Force re-login by clearing auth.
            if (typeof window !== 'undefined') {
              (async () => {
                try {
                  const { data } = await supabase
                    .from('wallet')
                    .select('user_id')
                    .eq('user_id', _auth.id)
                    .limit(1);
                  if (!data || data.length === 0) {
                    // RLS definitely blocked — token stale
                    console.warn('[AUTH] Session token stale. Forcing re-login.');
                    useStore.setState({
                      systemNotification: {
                        type: 'warning',
                        title: 'Session Expired',
                        message: 'Your session token has expired or changed. Please log in again.',
                      },
                    });
                    writeJSON(LS.auth, null);
                    useStore.setState({ auth: null });
                    setUserToken(null);
                  }
                } catch {}
              })();
            }
            return;
          }

          // Check if account is suspended or locked
          if (prof.login_status === 'LOCKED' || prof.account_status === 'SUSPENDED') {
            writeJSON(LS.auth, null);
            useStore.setState({ auth: null });
            return;
          }

          const users = readJSON(LS.users, {});
          const byUuid = readJSON(LS.byUuid, {});
          const key = prof.username.toLowerCase();
          users[key] = prof;
          byUuid[prof.uuid] = { ...prof, username: key };
          writeJSON(LS.users, users);
          writeJSON(LS.byUuid, byUuid);
          useStore.setState({ users: { ...users } });
        }).catch(() => {});
        if (!stillValid()) return; // logout happened during profile fetch
        subscribeWalletRealtime(
          _auth.id, _auth.username,
          () => useStore.getState().fetchBalances(),
          (tx) => {
            useStore.setState(s => ({ _rtTick: (s._rtTick || 0) + 1 }));
            if (tx.type === 'DEPOSIT' && tx.status === 'COMPLETED') {
              useStore.setState({
                systemNotification: {
                  type: 'deposit_approved', title: 'Deposit Approved',
                  message: `+${Number(tx.amount || 0).toLocaleString()} P credited.`,
                },
              });
            }
            if (tx.type === 'DEPOSIT' && (tx.status === 'REJECTED' || tx.status === 'FAILED')) {
              useStore.setState({
                systemNotification: {
                  type: 'deposit_rejected', title: 'Deposit Rejected',
                  message: `${Number(tx.amount || 0).toLocaleString()} P deposit rejected.`,
                },
              });
            }
            if (tx.type === 'WITHDRAWAL' && tx.status === 'COMPLETED') {
              useStore.setState({
                systemNotification: {
                  type: 'withdraw_approved', title: 'Withdrawal Complete',
                  message: `${Number(tx.amount || 0).toLocaleString()} P withdrawn.`,
                },
              });
            }
            if (tx.type === 'WITHDRAWAL' && (tx.status === 'REJECTED' || tx.status === 'FAILED')) {
              useStore.setState({
                systemNotification: {
                  type: 'withdraw_rejected', title: 'Withdrawal Rejected',
                  message: `${Number(tx.amount || 0).toLocaleString()} P withdrawal rejected.`,
                },
              });
            }
          }
        );
        // Start session heartbeat on auto-login (only if session still alive)
        if (!stillValid()) return;
        startHeartbeat(_auth.id);
      })();
    }
  }
}
