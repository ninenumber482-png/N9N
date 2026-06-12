# Admin Per-Page Access Limits — Design

**Date:** 2026-06-13
**App:** Angular admin (`/src`) + `n9_users` registry + `auth-login` Edge Function
**Status:** Approved (design), pending spec review → plan

---

## 1. Goal

Let `hemo` (superadmin) set **per-page access limits** for each Angular admin account: choose which admin pages each account may open. The sidebar hides disallowed pages and the route guard blocks them. Granular per-action (view vs edit) is **out of scope** (chosen: per-page).

## 2. Decisions (locked)

- **Granularity:** per-page (route-level).
- **Storage:** new column `n9_users.permissions text[]` (the admin registry from the hybrid migration is the source of truth for admin accounts).
- **Default:** `NULL`/empty `permissions` = **full access** (no behaviour change for existing admins). Once `hemo` saves a list, the account is restricted to exactly that list.
- **superadmin (hemo):** always full access; `permissions` is ignored for superadmin.
- **`/overview`:** always allowed (cannot be restricted) so no admin is fully locked out.

## 3. Architecture

### 3.1 Feature catalog (single source of truth)
A shared constant `ADMIN_FEATURES: { key: string; label: string }[]` where `key` = the route path (e.g. `/deposits`, `/kyc`, `/users`, …) and `label` = the human name (from `menu.ts`). Used by: the "Set Akses" checkbox UI, the guard, and the sidebar filter. Built from the existing routes in `menu.ts` / `dashboard-routing.module.ts` (the ~22 admin pages), **excluding** `/overview` (always allowed). Lives in `src/app/core/constants/` next to `menu.ts`.

### 3.2 Data model
`n9_users.permissions text[]` — array of allowed route keys. Semantics:
- `NULL` or `{}` → full access (default).
- non-empty → access limited to exactly those keys (plus `/overview` always).

### 3.3 Backend (`auth-login`)
Add `permissions` to the `n9_users` select; include it in the returned `user` object: `user.permissions` (array | null). The Angular app already gets `user.role` etc. from this response. (Permissions are an admin-only concept and live only on `n9_users`; no users-table mirror needed — `auth-login` already reads `n9_users` as `n9Row`.)

### 3.4 Frontend (Angular)
- **AuthService:** persist `permissions` on the current user (alongside `role`, `username`, `token`).
- **Guard (extend `RoleGuard`):** after the existing role check, add a page-permission check:
  - `role === 'superadmin'` → allow (bypass).
  - `permissions` null/empty → allow.
  - route key ∈ `permissions` (or route is `/overview`) → allow.
  - else → log failed access (existing `AuditService`) + `router.navigate(['/overview'])`, return false.
  The route key is derived from `state.url` (strip query/leading segment to match the `ADMIN_FEATURES` key).
- **Sidebar (`sidebar*` components / `MenuService`):** filter menu items so an account only sees pages it may access (superadmin/empty → all). Keeps the **PAGE_ORDER**/prev-next nav consistent with the filtered set.
- **Role Management page:** for each admin row, a **"Set Akses"** button → `p-dialog` with a checkbox per `ADMIN_FEATURES` entry (pre-checked from the account's current `permissions`; empty list shown as "all"). Save → `admin.setAdminPermissions(username, keys[])` → `proxy('PATCH', '/n9_users?username=eq.…', { permissions: keys })` (service_role). "Reset to full" = save `null`/`[]`.
  - Only visible to superadmin (page already superadmin-gated). A superadmin row shows "Full (superadmin)" — not editable.

## 4. Live impact

| Change | Type | Gated |
|--------|------|-------|
| `ALTER TABLE n9_users ADD COLUMN permissions text[]` | DB schema (additive, nullable) | Yes (operator go) |
| `auth-login` returns `permissions` | Edge Function redeploy | Yes |
| Angular: catalog, AuthService, guard, sidebar filter, Role Management UI + service method | Rebuild + Cloudflare redeploy | Yes |

- Additive column, nullable → no behaviour change until `hemo` sets limits. No impact on the React user app, the security lockdowns, or roles.

## 5. Verification

- DB: `permissions` column exists on `n9_users` (nullable).
- `auth-login` (hemo) → response includes `permissions` (null for hemo; superadmin ignores it anyway).
- Set a test admin's permissions to e.g. `{'/deposits','/withdrawals'}` → that account's sidebar shows only those (+ Overview); navigating to `/kyc` redirects to `/overview`. (Verify by logging that admin in — needs a working admin login; document manual check.) hemo (superadmin) still sees everything.
- Empty/null permissions → account sees all pages (unchanged).

## 6. Out of scope

- Per-action / view-vs-edit permissions.
- Permission presets/tiers.
- Applying limits to the React user app (this is admin-only).
- Fixing `$2a$` admin login (separate).
