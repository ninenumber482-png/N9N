# Admin Access & Monitoring Enhancements — Design

**Date:** 2026-06-13
**App:** Angular admin (`/src`) + shared Supabase backend
**Status:** Approved (design), pending implementation plan

---

## 1. Goals

Four cohesive enhancements to the Angular admin, requested by the operator:

- **A.** Surface the existing, unused `get_online_users()` RPC as an "Online Now" view.
- **B.** Make the `hemo` developer account a full-access (`superadmin`) account.
- **C.** Let `hemo` (superadmin) manage **who can log into the Angular admin** and their access (coarse, role-based).
- **D.** Auto-stamp the Angular build version (git hash + build time) in the sidebar, updated automatically each build.

**Non-goal (explicitly deferred):** granular per-page/per-feature permissions. The access model stays **coarse** (`role` = `admin` | `superadmin`, plus `login_status`). No new permissions table. This is a YAGNI decision; can be revisited later.

---

## 2. Existing state (verified)

- **Login gate:** `supabase/functions/auth-login/index.ts` only authenticates users with `role IN ('admin','superadmin')` and `login_status != 'SUSPENDED'`. This is already the "who can log into Angular" gate.
- **RoleGuard** (`src/app/core/guards/role.guard.ts`): routes carry `data.requiredRole`; `superadmin` bypasses every check.
- **Role Management page** (`src/app/modules/dashboard/pages/role-management/role-management.component.ts`, superadmin-only): lists admin/superadmin users (`admin.getAdminUsers()`), flips `admin↔superadmin` via `confirmRoleChange()` → `changeRole()`.
- **Session Monitor page** (`.../session-monitor/session-monitor.component.ts`): shows raw sessions via `admin.getUserSessions(100)`, auto-refresh 30s. Does **not** use `get_online_users()`.
- **`get_online_users()` RPC:** exists, `SECURITY DEFINER`, locked to `service_role` (migration `20260612110000`). Returns users active in the last 5 min: `user_id, last_activity, ip_address, device_info`. Currently called by nobody.
- **admin-proxy** (`supabase/functions/admin-proxy/index.ts`): all admin DB access flows through it using `N9_SERVICE_ROLE_KEY`. It has an explicit `ALLOWED_RPCS` allowlist; `get_online_users` is **not** in it.
- **Current roles in DB:** `hemo`, `number9`, `admin`, `concurrent_admin` are all `role='admin'`. **No `superadmin` exists** → Role Management is currently unusable by anyone.
- **Version:** `environment.ts` has no version field; `scripts/set-env.js` (runs at build, generates `environment.prod.ts`) injects no version. `package.json` version = `1.0.0`.
- **login_status helpers** already exist: `admin.lockUser()`/`unlockUser()` → `updateRow('users', id, { login_status })` via proxy.

---

## 3. Design

### Part A — Online Users widget (in Session Monitor)

**Data path**
1. `supabase/functions/admin-proxy/index.ts`: add `'get_online_users'` to `ALLOWED_RPCS`. (Edge Function change → redeploy admin-proxy.)
2. `src/app/core/services/admin.service.ts`: add
   ```ts
   getOnlineUsers() { return this.proxy<any[]>('POST', '/rpc/get_online_users', {}); }
   ```
3. Session Monitor component: add an **"Online Now (N)"** panel above the sessions table:
   - count badge + compact list: username (resolve `user_id`→username from the sessions/users data already loaded; fall back to short `user_id`), `last_activity` as relative ("X dtk lalu", via existing date pipe/helper), `ip_address`, `device_info` summary.
   - Loads alongside the existing 30s refresh (`load()` also calls `getOnlineUsers()`); OnPush → `cdr.markForCheck()` after.
   - Fail-soft: if the RPC errors, hide the panel / show "—", don't break the sessions table.

**No DB change** (RPC already exists). Live impact: redeploy admin-proxy + Angular.

### Part B — hemo = superadmin

- One-time DB **data** update (no schema):
  ```sql
  UPDATE public.users SET role='superadmin' WHERE username='hemo';
  ```
- Effect: `hemo` bypasses all RoleGuard checks and can use Role Management. Becomes the sole superadmin.
- Authorized explicitly by the operator. Applied via `supabase db query --linked` (surgical), verified after.

### Part C — Access management (extend Role Management, coarse)

Extend the existing Role Management page so the superadmin (`hemo`) controls Angular access. All persistence uses existing proxy PATCH (service_role) / existing patterns — **no new DB schema/RPC**.

1. **(exists)** Flip `admin↔superadmin`.
2. **Enable/Disable Angular login** per admin: toggle `login_status` `ACTIVE↔SUSPENDED` (reuse `lockUser`/`unlockUser` pattern, or `updateRow('users', id, { login_status })`). `auth-login` already rejects `SUSPENDED`.
3. **Revoke admin** (demote `admin`→`member`/regular role): removes Angular access. Uses the existing role-change mechanism with target = the regular member role value used elsewhere in the schema (to confirm during planning).
4. **Grant admin**: search a member account (reuse existing user lookup) and promote `role`→`admin` so they can log into Angular.

**Guards & safety**
- These actions are superadmin-only (UI gated by `isSuperadmin`, already present; routes already `requiredRole: 'superadmin'`).
- Every destructive action uses `p-confirmdialog` and writes to the existing audit log.
- A superadmin cannot demote/disable **their own** account (guard against self-lockout) — the page already excludes `currentUsername` from role actions; extend the same exclusion to disable/revoke.

### Part D — Version stamp (sidebar footer, auto)

1. `scripts/set-env.js`: at build, inject into the generated `environment.prod.ts`:
   - `appVersion`: from `package.json` version.
   - `buildHash`: `git rev-parse --short HEAD` (try/catch → `'dev'` or `process.env.CF_PAGES_COMMIT_SHA?.slice(0,7)` fallback if git unavailable in the Cloudflare build env).
   - `buildTime`: ISO timestamp at build.
2. `environment.ts` (dev) + the `environment` interface: add `appVersion`, `buildHash`, `buildTime` with static dev placeholders so local builds typecheck.
3. Sidebar component (`src/app/modules/dashboard/.../layout` sidebar): small muted footer line, e.g. `v{appVersion} · {buildHash} · {buildTime|date}`.
4. "Don't set it each update": `buildHash`+`buildTime` change automatically every build; no manual bump needed. `appVersion` only changes if you bump `package.json`.

**Caveat:** confirm git is available in the Cloudflare Pages build; if not, the `CF_PAGES_COMMIT_SHA` env fallback covers it.

---

## 4. Live impact & constraints

| Change | Type | Needs explicit go |
|--------|------|-------------------|
| hemo → superadmin | DB **data** update (no schema) | Already requested by operator |
| admin-proxy `ALLOWED_RPCS += get_online_users` | Edge Function redeploy | Yes (live deploy) |
| Angular: Session Monitor, Role Management, sidebar, set-env.js | Rebuild + Cloudflare Pages redeploy | Yes (live deploy) |

- **No DB schema/migration/RPC creation** anywhere (honors the no-DB-schema-change constraint). The only DB touch is one `UPDATE` on `users.role` for hemo, which was explicitly requested.
- Each live step (DB update, admin-proxy deploy, Angular deploy) is run only on the operator's go.

## 5. Verification

- **A:** with a live session active, the "Online Now (N)" panel shows the user; `get_online_users` via proxy returns rows; anon still cannot call it (already verified locked). Screenshot Session Monitor.
- **B:** `SELECT role FROM users WHERE username='hemo'` → `superadmin`; Role Management page loads for hemo; a `requiredRole:'superadmin'` route is reachable.
- **C:** disable an admin → that account is rejected at `auth-login`; revoke admin → account can no longer reach admin routes; grant admin to a member → can log in. Self-lockout prevented. Screenshot the extended page.
- **D:** built `environment.prod.ts` contains a real `buildHash`/`buildTime`; sidebar footer renders the stamp; rebuild changes the hash/time. Screenshot sidebar.

## 6. Out of scope

- Granular per-page/per-feature permissions (permissions table + RPC + guard rework).
- `admin-favicon.svg` (separate, noted elsewhere).
- Any change to the React user app.
