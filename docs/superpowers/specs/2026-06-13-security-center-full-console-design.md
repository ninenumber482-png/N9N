# Security Center — "Full Console" Upgrade — Design

**Date:** 2026-06-13
**App:** Angular admin — `src/app/modules/dashboard/pages/security-center/security-center.component.ts` (396 lines) + `src/app/core/services/admin.service.ts`
**Route:** `/security-center` (RoleGuard `admin`)
**Status:** Approved scope = **Full security console**.

## Goal
Turn the read-only Security Center into an actionable security-ops console: resolve/acknowledge alerts, clear failed-login records to unlock rate-limited users, show real usernames, KPI summary, severity/open filters, alert detail dialog, CSV export, and auto-refresh — **without any DB schema/RPC/migration/edge change**.

## Non-negotiable constraints
- **No DB schema/migration/RPC/edge-function change.** Every write uses the existing `admin-proxy` (service_role) via `admin.service` helpers (`updateRow` PATCH, `deleteRow` DELETE, generic `proxy(method,path,body)`).
- All writes are **live-data mutations fired only on operator click**, each behind a branded `p-confirmdialog`. Deploy of the code itself is read-only.
- No Supabase realtime channel (would require adding the table to `supabase_realtime` publication = DB change). Use **polling auto-refresh** instead.
- Shared contracts (session constants, RPC signatures) untouched.

## Verified facts (from exploration)
- `security_alerts` columns: `id, alert_type, severity, user_id, ip_address, description, details JSONB, resolved_at, created_at`. **`resolved_at` already exists** → resolve = `PATCH resolved_at=now`. No schema change.
- `failed_logins` columns: `id, username, ip_address, reason, user_agent, attempted_at, created_at`. Both `attempted_at`/`created_at` exist (current `order=attempted_at.desc` is valid — no bug).
- Lockout is enforced by **counting `failed_logins` rows** for username+ip within `RATE_LIMIT_WINDOW_MS = 900_000` (15 min), `RATE_LIMIT_MAX = 5` (in `auth-login` + `user-login`). `user-login` deletes those rows on a successful login. → **Deleting `failed_logins` rows for a username genuinely lifts the lockout.**
- `admin.service` already has private `updateRow(table,id,data)` (PATCH `?id=eq.`), private `deleteRow(table,id)` (DELETE `?id=eq.`), public `insertRow`, and generic `proxy(method,path,body?)`. PATCH/DELETE with PostgREST filters are supported by the proxy.
- `audit_log` read via `getAuditLogs(limit)` — columns `admin_id, action, resource_type, resource_id, ip_address, created_at`.

## Design

### admin.service additions (public wrappers, single source of truth)
```ts
// security_alerts
resolveAlert(id: string)            // updateRow('security_alerts', id, { resolved_at: new Date().toISOString() })
resolveAllOpenAlerts()              // proxy('PATCH', '/security_alerts?resolved_at=is.null', { resolved_at: <nowISO> })

// failed_logins
clearFailedLogins(username: string) // proxy('DELETE', `/failed_logins?username=eq.${encodeURIComponent(username)}`)
clearOldFailedLogins(cutoffISO: string) // proxy('DELETE', `/failed_logins?attempted_at=lt.${cutoffISO}`)

// username map for display (id -> username)
getUserNameMap(): Promise<Record<string,string>>  // get('users','select=id,username,display_name&limit=1000') → map
```
Notes: `updateRow`/`deleteRow` stay private; new methods call them or `proxy` from inside the service. `new Date().toISOString()` runs in the browser (allowed; the Date restriction is workflow-script-only).

### Component — Security Alerts tab
- **User column** → `userMap[l.user_id] || l.user_id?.slice(0,10) || '-'`.
- **Status column** → `<app-status-badge>` OPEN (warn) / RESOLVED (secondary) from `l.resolved_at`.
- **Toolbar** (above table): severity `p-select` (`all|critical|high|medium|low`) + **"Open only"** toggle (default ON). Both filter the loaded array client-side via a `filteredAlerts` getter; pagination/`displayItems` operate on the filtered set.
- **Row action**: `Resolve` button (hidden if already resolved) → `confirmResolve(alert)` → `admin.resolveAlert(id)` → silent reload + toast.
- **Row click** → `openAlertDetail(alert)`: `p-dialog` (styleClass consistent w/ global branded modal) showing time, type, severity, user (username), ip, description, `details` JSON (`<pre>` pretty-print), status; a `Resolve` button inside when open.
- **Bulk**: `Resolve all open` button (only when ≥1 open) → confirm → `admin.resolveAllOpenAlerts()` → reload.

### Component — Failed Logins tab
- **Row action**: `Clear / Unlock` button → `confirmClearUser(username)` → `admin.clearFailedLogins(username)` → reload + toast ("Lockout dilepas untuk {username}").
- **Bulk**: `Clear old (>15m)` button → confirm → `admin.clearOldFailedLogins(<now-15min ISO>)` → reload. Window matches `RATE_LIMIT_WINDOW_MS` so currently-active lockouts are untouched (only stale records purged).

### Component — Recent Audit tab
- **Admin column** → `userMap[l.admin_id] || l.admin_id?.slice(0,10) || 'system'`.
- Bump fetch `getAuditLogs(30)` → `getAuditLogs(100)` so pagination has full data.

### KPI header strip
Row of small cards under `<app-page-header>`: **Open Alerts** (with critical count emphasized red), **Failed Logins (15m)**, **Audit Events**. All computed client-side from loaded arrays. Hidden on `2fa` tab.

### CSV export
`Export CSV` button (in page-header actions) → builds CSV from the **current tab's** rows (a small local `toCsv(rows, columns)` helper + Blob + anchor download, filename `security-{tab}-{date}.csv`). Client-side only.

### Auto-refresh (polling)
- `ngOnInit`: `setInterval(() => this.poll(), 25_000)` stored in a field; `OnDestroy` clears it.
- `poll()`: skip if `loading`, `tab === '2fa'`, or `document.hidden`; otherwise silently re-fetch the three arrays (no spinner, no error toast on transient failure) + `cdr.markForCheck()`.
- A small "Auto" indicator near the refresh button (optional, low priority).

### Data load
`load()` additionally fetches `getUserNameMap()` in the `Promise.all`; stores `userMap`. `getAuditLogs(100)`.

## Files
- **Modify** `src/app/core/services/admin.service.ts` — add the 5 public methods above.
- **Modify** `src/app/modules/dashboard/pages/security-center/security-center.component.ts` — toolbar/filters, Status & username columns, row+bulk actions, detail dialog, KPI strip, CSV export, polling, `OnDestroy`, `DialogModule`/`ButtonModule` imports as needed, extra `p-confirmdialog` keys.

## Error handling
- Every action wrapped in try/catch → `notify.error(...)`; success → `notify.success(...)`; always `cdr.markForCheck()` in `finally`.
- Per-action in-flight guards (disable button while running) like existing `resettingId`.
- Polling failures are swallowed (transient) — no toast, keep last data.

## Out of scope
- True Supabase-channel realtime (needs publication change = DB). Deferred; polling used.
- Any new DB column/table/RPC/edge function.
- Touching the 2FA tab logic.

## Verification
- `npm run build` clean; `npm run lint` no *new* errors.
- Behind login+MFA (operator): Resolve an alert → drops out of "open only"; Clear a failed-login username → that user can log in again (lockout lifted); usernames render in alerts+audit; detail dialog opens with JSON details; CSV downloads; severity/open filters work; polling refreshes without a full reload.
- No regression to 2FA hard-reset.
