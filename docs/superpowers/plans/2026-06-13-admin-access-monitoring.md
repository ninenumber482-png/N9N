# Admin Access & Monitoring Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the unused `get_online_users()` RPC into an "Online Now" widget, make `hemo` a full-access superadmin, let the superadmin manage who can log into Angular (coarse role/login_status), and auto-stamp the build version in the sidebar.

**Architecture:** Pure extension of existing Angular admin patterns (standalone components, inline templates, OnPush, `inject()`, PrimeNG, `admin-proxy`/service_role for all DB access). No new DB schema, no new RPC. One DB **data** update (hemo role). One `admin-proxy` allowlist line + redeploy. Angular rebuild + Cloudflare Pages redeploy.

**Tech Stack:** Angular 22 (zoneless), PrimeNG, Tailwind 4, Supabase (Edge Functions `admin-proxy`/`auth-login`, RPC `get_online_users`), Cloudflare Pages, `wrangler`, Supabase CLI.

**Verification approach (read first):** This admin app is verified via **build (`npm run build`) + lint (`npm run lint`) + live run/screenshot (`bash .claude/skills/run-number9/smoke.sh --no-api --keep`, screenshot at `:4201`) + targeted `supabase db query` / `curl` checks**. Karma unit tests are NOT used here (zoneless + inline-template + many-deps TestBed does not run cleanly headless). Each task's verification reflects this.

**Spec:** `docs/superpowers/specs/2026-06-13-admin-access-monitoring-design.md`

**Key facts (verified in codebase):**
- Regular member role value = `user` (demote target). Roles in DB: `user`(17), `admin`(4), `member`(1).
- `auth-login` blocks login only when `login_status = 'SUSPENDED'` (NOT `LOCKED`). So "disable Angular login" MUST set `'SUSPENDED'`.
- `admin.updateUser(id, data)` → PATCH `users` via proxy (service_role). `admin.getUserByUsername(name)` returns `[{id,username,display_name,email,role}]`.
- `auth-login` only authenticates `role IN ('admin','superadmin')`. So granting admin = `role='admin'`; revoking = `role='user'`.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `supabase/functions/admin-proxy/index.ts` | RPC allowlist | Modify (add 1 entry) |
| `src/app/core/services/admin.service.ts` | RPC/DB wrappers | Modify (add `getOnlineUsers`, `setUserLogin`, `setUserRole`) |
| `src/app/modules/dashboard/pages/session-monitor/session-monitor.component.ts` | Sessions + Online Now | Modify (add widget + load) |
| `src/app/modules/dashboard/pages/role-management/role-management.component.ts` | Access management | Modify (toggle/revoke/grant) |
| `scripts/set-env.js` | Build-time env generation | Modify (inject version fields) |
| `src/environments/environment.ts` | Dev env | Modify (add 3 fields) |
| `src/environments/environment.prod.ts` | Prod env (generated) | Modify (add 3 fields) |
| `src/app/modules/layout/components/sidebar/sidebar.component.ts` | Sidebar logic | Modify (expose version) |
| `src/app/modules/layout/components/sidebar/sidebar.component.html` | Sidebar template | Modify (version footer line) |
| (DB) `public.users` | hemo role | Data update |

---

## Task 1: hemo → superadmin (DB data update)

**Files:** DB only (`public.users`). Operator already authorized this explicitly.

- [ ] **Step 1: Back up hemo's current role**

Run:
```bash
export PATH="$HOME/.local/share/supabase:$PATH"
cd /home/hemo/WEBSITE/N9NY-tailwind-N9
supabase db query --linked -o json \
  "SELECT username, role FROM public.users WHERE username='hemo';" \
  | tee /tmp/hemo-role-before.json
```
Expected: shows `"role": "admin"`.

- [ ] **Step 2: Promote hemo to superadmin**

Run:
```bash
supabase db query --linked \
  "UPDATE public.users SET role='superadmin' WHERE username='hemo';"
```
Expected: `"rows": []` (UPDATE returns no rows), no error.

- [ ] **Step 3: Verify**

Run:
```bash
supabase db query --linked -o json \
  "SELECT username, role FROM public.users WHERE username='hemo';"
```
Expected: `"role": "superadmin"`.

- [ ] **Step 4: No commit** — this is a runtime DB change, not a code change. Record it in the task notes / session summary instead.

---

## Task 2: Online Users — "Online Now" widget

### 2a. Allow the RPC through admin-proxy

**Files:** Modify `supabase/functions/admin-proxy/index.ts` (the `ALLOWED_RPCS` Set, around line 276-305).

- [ ] **Step 1: Add `get_online_users` to the allowlist**

In the `const ALLOWED_RPCS = new Set([ ... ])` block, add the entry next to the other read RPCs (e.g. after `'get_platform_stats',`):
```ts
    'get_platform_stats',
    'get_online_users',
```

- [ ] **Step 2: Type-check the function locally (no deploy yet)**

Run:
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9
deno check supabase/functions/admin-proxy/index.ts 2>&1 | tail -5 || echo "deno not present — skip (will validate at deploy)"
```
Expected: no type errors (or skipped if `deno` absent).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-proxy/index.ts
git commit -m "🔒 admin-proxy: autorise le RPC get_online_users (service_role)"
```

### 2b. Service method

**Files:** Modify `src/app/core/services/admin.service.ts` (near `getUserSessions`, ~line 534).

- [ ] **Step 4: Add `getOnlineUsers()`**

Add this method (after `getUserSessions`):
```ts
  /** Users active in the last 5 min (RPC get_online_users, via service_role). */
  getOnlineUsers() {
    return this.proxy<{ user_id: string; last_activity: string; ip_address: string; device_info: unknown }[]>(
      'POST',
      '/rpc/get_online_users',
      {},
    );
  }
```

- [ ] **Step 5: Lint the service**

Run:
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npx eslint src/app/core/services/admin.service.ts 2>&1 | tail -5 || echo done
```
Expected: no new errors.

### 2c. Session Monitor "Online Now" panel

**Files:** Modify `src/app/modules/dashboard/pages/session-monitor/session-monitor.component.ts`.

- [ ] **Step 6: Add the OnlineUser interface + component fields**

After the existing `interface SessionData { ... }` (line 23), add:
```ts
interface OnlineUser {
  user_id: string;
  last_activity: string;
  ip_address: string;
  device_info?: { model?: string } | null;
}
```
In the class (after `sessions: SessionData[] = [];`, line 125), add:
```ts
  online: OnlineUser[] = [];
```

- [ ] **Step 7: Fetch online users in `load()`**

Replace the `try { this.sessions = await this.admin.getUserSessions(100); }` block (lines 145-149) with:
```ts
    try {
      const [sessions, online] = await Promise.all([
        this.admin.getUserSessions(100),
        this.admin.getOnlineUsers().catch(() => [] as OnlineUser[]),
      ]);
      this.sessions = sessions;
      this.online = online;
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Could not load sessions';
    }
```

- [ ] **Step 8: Add the "Online Now" panel to the template**

Immediately after `<app-loading-error ... />` (line 44) and before the `@if (!loading && !error) {` sessions block, add:
```html
      @if (!loading && !error) {
        <div class="bg-card border-border rounded-lg border p-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
            <h3 class="text-sm font-semibold text-foreground">Online Now</h3>
            <span class="text-xs text-muted-foreground">({{ online.length }})</span>
          </div>
          @if (online.length) {
            <div class="flex flex-wrap gap-2">
              @for (o of online; track o.user_id) {
                <div class="bg-accent/30 border-border rounded-md border px-3 py-1.5 text-xs">
                  <span class="font-mono font-semibold text-foreground">{{ o.user_id.slice(0, 8) }}</span>
                  <span class="text-muted-foreground"> · {{ o.ip_address || '-' }}</span>
                  <span class="text-muted-foreground"> · {{ o.last_activity | wibDate: 'short' }}</span>
                </div>
              }
            </div>
          } @else {
            <p class="text-xs text-muted-foreground">No users online in the last 5 minutes.</p>
          }
        </div>
      }
```

- [ ] **Step 9: Build to verify it compiles**

Run:
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run build 2>&1 | grep -E "Application bundle generation complete|error|Error" | head
```
Expected: "Application bundle generation complete", no errors.

- [ ] **Step 10: Commit**

```bash
git add src/app/core/services/admin.service.ts src/app/modules/dashboard/pages/session-monitor/session-monitor.component.ts
git commit -m "✨ admin: widget 'Online Now' dans Session Monitor (get_online_users)"
```

---

## Task 3: Access management (extend Role Management)

**Files:** Modify `src/app/modules/dashboard/pages/role-management/role-management.component.ts` only. Uses existing `admin.updateUser` / `admin.getUserByUsername`.

- [ ] **Step 1: Add helper methods (login toggle, revoke, grant) to the class**

After the existing `changeRole()` method (ends line 167), add:
```ts
  // ── Enable/disable Angular login (auth-login blocks login_status='SUSPENDED') ──
  confirmToggleLogin(u: AdminUser) {
    if (u.username === this.currentUsername) return; // never lock yourself out
    const disable = u.login_status === 'ACTIVE';
    this.confirmation.confirm({
      message: disable
        ? `Nonaktifkan login Angular untuk <strong>${u.username}</strong>?`
        : `Aktifkan kembali login Angular untuk <strong>${u.username}</strong>?`,
      header: disable ? 'Nonaktifkan Login' : 'Aktifkan Login',
      rejectLabel: 'Batal',
      acceptLabel: disable ? 'Nonaktifkan' : 'Aktifkan',
      accept: () => this.setLogin(u, disable ? 'SUSPENDED' : 'ACTIVE'),
    });
  }

  async setLogin(u: AdminUser, status: 'ACTIVE' | 'SUSPENDED') {
    try {
      await this.admin.updateUser(u.id, { login_status: status });
      u.login_status = status;
      this.notification.success('Status login diubah', `${u.username}: ${status}`);
    } catch (e: unknown) {
      this.notification.error('Gagal', e instanceof Error ? e.message : 'Tidak bisa mengubah status login.');
    }
    this.cdr.markForCheck();
  }

  // ── Revoke admin access (demote to regular 'user' role) ──
  confirmRevoke(u: AdminUser) {
    if (u.username === this.currentUsername) return;
    this.confirmation.confirm({
      message: `Cabut akses admin <strong>${u.username}</strong> (turunkan ke 'user')? Akun ini tidak akan bisa login Angular lagi.`,
      header: 'Cabut Akses Admin',
      rejectLabel: 'Batal',
      acceptLabel: 'Cabut',
      accept: () => this.changeRole(u, 'user'),
    });
  }

  // ── Grant admin to an existing member account (by username) ──
  grantUsername = '';
  granting = false;

  async grantAdmin() {
    const name = this.grantUsername.trim();
    if (!name) return;
    this.granting = true;
    this.cdr.markForCheck();
    try {
      const rows = await this.admin.getUserByUsername(name);
      const target = rows?.[0];
      if (!target) {
        this.notification.error('Tidak ditemukan', `Akun '${name}' tidak ada.`);
      } else if (target.role === 'admin' || target.role === 'superadmin') {
        this.notification.error('Sudah admin', `'${name}' sudah punya akses admin.`);
      } else {
        await this.admin.updateUser(target.id, { role: 'admin', login_status: 'ACTIVE' });
        this.notification.success('Admin ditambahkan', `${name} sekarang bisa login Angular.`);
        this.grantUsername = '';
        await this.load();
      }
    } catch (e: unknown) {
      this.notification.error('Gagal', e instanceof Error ? e.message : 'Tidak bisa memberi akses admin.');
    }
    this.granting = false;
    this.cdr.markForCheck();
  }
```

- [ ] **Step 2: Add the grant-by-username input to the template**

Immediately after the `<app-page-header ...>...</app-page-header>` block (line 39) add (superadmin-only):
```html
      @if (isSuperadmin) {
        <div class="bg-card border-border rounded-lg border p-4 flex flex-wrap items-end gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs text-muted-foreground">Beri akses admin (username)</label>
            <input
              [(ngModel)]="grantUsername"
              (keyup.enter)="grantAdmin()"
              placeholder="username member"
              class="bg-background border-border rounded border px-3 py-1.5 text-sm text-foreground" />
          </div>
          <button
            (click)="grantAdmin()"
            [disabled]="granting || !grantUsername.trim()"
            class="bg-yellow-400 text-black rounded px-3 py-1.5 text-sm font-bold disabled:opacity-50">
            {{ granting ? '...' : 'Grant Admin' }}
          </button>
        </div>
      }
```

- [ ] **Step 3: Add Login toggle + Revoke buttons to the "Change Role" cell**

Inside the `@if (isSuperadmin && u.username !== currentUsername) { <div class="flex gap-1"> ... </div> }` block (after the `→ Superadmin` button, before the closing `</div>` at line 85), add:
```html
                          <button
                            (click)="confirmToggleLogin(u)"
                            class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors">
                            {{ u.login_status === 'ACTIVE' ? 'Disable' : 'Enable' }}
                          </button>
                          @if (u.role === 'admin') {
                            <button
                              (click)="confirmRevoke(u)"
                              class="border-rose-500/40 text-rose-400 hover:bg-rose-500/10 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors">
                              Revoke
                            </button>
                          }
```

- [ ] **Step 4: Add `FormsModule` is already imported** — verify the import line (line 3) already has `import { FormsModule } from '@angular/forms';`. It does. No change needed (the `[(ngModel)]` works).

- [ ] **Step 5: Build to verify it compiles**

Run:
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run build 2>&1 | grep -E "Application bundle generation complete|error|Error" | head
```
Expected: bundle complete, no errors.

- [ ] **Step 6: Lint**

Run:
```bash
npx eslint src/app/modules/dashboard/pages/role-management/role-management.component.ts 2>&1 | tail -5 || echo done
```
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/modules/dashboard/pages/role-management/role-management.component.ts
git commit -m "✨ admin: gestion d'accès Angular (grant/revoke admin, enable/disable login)"
```

---

## Task 4: Version stamp (auto, sidebar footer)

### 4a. Inject version at build time

**Files:** Modify `scripts/set-env.js`.

- [ ] **Step 1: Compute and inject version fields**

In `scripts/set-env.js`, after the `serverMonitorUrl` const block (line 34) add:
```js
// Build version stamp (auto — no manual bump needed)
const { execSync } = require('child_process');
const pkgVersion = require('../package.json').version || '0.0.0';
let buildHash = 'dev';
try {
  buildHash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  buildHash = (process.env.CF_PAGES_COMMIT_SHA || 'dev').slice(0, 7);
}
const buildTime = new Date().toISOString();
```
Then replace the `const content = ...` template (lines 36-42) with:
```js
const content = `export const environment = {
  production: true,
  supabaseUrl: '${supabaseUrl}',
  supabaseKey: '${supabaseKey}',
  serverMonitorUrl: '${serverMonitorUrl}',
  appVersion: '${pkgVersion}',
  buildHash: '${buildHash}',
  buildTime: '${buildTime}',
};
`;
```
And add a log line after the existing `console.log` calls (line 47):
```js
console.log(`  VERSION: v${pkgVersion} · ${buildHash} · ${buildTime}`);
```

- [ ] **Step 2: Run set-env.js and confirm fields appear**

Run:
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && node scripts/set-env.js && grep -E "appVersion|buildHash|buildTime" src/environments/environment.prod.ts
```
Expected: three lines, with a real short git hash and ISO timestamp.

### 4b. Dev environment fields (typecheck parity)

**Files:** Modify `src/environments/environment.ts`.

- [ ] **Step 3: Add the 3 fields to the dev environment**

In `src/environments/environment.ts`, add inside the object (after `serverMonitorUrl`):
```ts
  appVersion: '1.0.0',
  buildHash: 'dev',
  buildTime: 'dev',
```

### 4c. Sidebar footer line

**Files:** Modify `src/app/modules/layout/components/sidebar/sidebar.component.ts` + `.html`.

- [ ] **Step 4: Expose a formatted version string in the component**

In `sidebar.component.ts`, add the import at the top (after line 9):
```ts
import { environment } from 'src/environments/environment';
```
In the class (after `clockTime = '';`, line 31) add:
```ts
  readonly buildLabel = `v${environment.appVersion} · ${environment.buildHash}`;
  readonly buildDate = environment.buildTime.slice(0, 10);
```

- [ ] **Step 5: Render it under the clock**

In `sidebar.component.html`, after the `<p class="truncate text-[10px] text-emerald-400/70">System D · Connected</p>` line (line 57), add:
```html
          <p class="truncate text-[10px]" style="color: var(--sidebar-muted)" [title]="buildLabel + ' · ' + buildDate">
            {{ buildLabel }}
          </p>
```

- [ ] **Step 6: Build to verify**

Run:
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run build 2>&1 | grep -E "Application bundle generation complete|error|Error" | head
```
Expected: bundle complete, no errors. (Note: `npm run build` runs `set-env.js` first, regenerating prod env.)

- [ ] **Step 7: Commit**

```bash
git add scripts/set-env.js src/environments/environment.ts src/environments/environment.prod.ts \
  src/app/modules/layout/components/sidebar/sidebar.component.ts \
  src/app/modules/layout/components/sidebar/sidebar.component.html
git commit -m "🔖 admin: version stamp auto (git hash + build time) en pied de sidebar"
```

---

## Task 5: Deploy & end-to-end verification

**Files:** none (operational). Each live step waits for the operator's go.

- [ ] **Step 1: Deploy admin-proxy (for the new RPC allowlist)**

Run (operator-approved):
```bash
export PATH="$HOME/.local/share/supabase:$PATH"
cd /home/hemo/WEBSITE/N9NY-tailwind-N9
supabase functions deploy admin-proxy --project-ref dqsmpdetiqsqfnidekik 2>&1 | tail -5
```
Expected: "Deployed Function admin-proxy".

- [ ] **Step 2: Deploy Angular**

Run (operator-approved):
```bash
npm run deploy 2>&1 | tail -4
```
Expected: "Deployment complete!".

- [ ] **Step 3: Verify hemo is superadmin (Task 1 stuck)**

Run:
```bash
supabase db query --linked -o json "SELECT username, role FROM public.users WHERE username='hemo';"
```
Expected: `superadmin`.

- [ ] **Step 4: Screenshot Session Monitor (Online Now) + Role Management + sidebar**

Run:
```bash
bash .claude/skills/run-number9/smoke.sh --no-api --keep
# then, with Angular dev on :4201, log in and navigate; capture:
chromium --headless=new --disable-gpu --window-size=1366,900 \
  --screenshot=/tmp/verify-session-monitor.png http://localhost:4201/session-monitor
chromium --headless=new --disable-gpu --window-size=1366,900 \
  --screenshot=/tmp/verify-role-mgmt.png http://localhost:4201/role-management
```
(Auth is required to reach these; if the headless shot lands on sign-in, verify on the deployed `admin.mynumber9.uk` after logging in, or document the manual check.) Open each PNG and confirm: Online Now panel renders; Role Management shows grant input + Disable/Revoke buttons; sidebar shows the version line.

- [ ] **Step 5: Functional check — disabled admin cannot log in (optional, on a throwaway test admin only)**

Only if a disposable test admin exists. Set it `SUSPENDED` via the UI, then:
```bash
curl -s -X POST "https://dqsmpdetiqsqfnidekik.supabase.co/functions/v1/auth-login" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ANON_KEY" \
  -d '{"username":"<testadmin>","password":"<pw>"}'
```
Expected: login rejected. Re-enable afterwards. **Do not** suspend a real operator account.

---

## Self-Review notes

- **Spec coverage:** A → Task 2; B → Task 1; C → Task 3; D → Task 4; deploy/verify → Task 5. All covered.
- **Type consistency:** `getOnlineUsers()` return shape matches the `OnlineUser` interface used in Task 2c. `updateUser(id, data)` / `getUserByUsername` signatures match admin.service. `login_status` values `'ACTIVE'`/`'SUSPENDED'` consistent across Task 3 and the auth-login gate.
- **No DB schema/RPC creation.** Only `users.role` data update (Task 1) + `admin-proxy` allowlist line (Task 2a) + Angular code.
- **Self-lockout guard:** all destructive role/login actions exclude `currentUsername`.
