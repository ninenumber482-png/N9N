# Admin Per-Page Access Limits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, recommended — has live DB/deploy checkpoints) to implement task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Let `hemo` (superadmin) limit each Angular admin account to a chosen set of pages; sidebar hides disallowed pages and the route guard blocks them. `NULL`/empty permissions = full access (default); superadmin always full; `/overview` always allowed.

**Architecture:** New nullable `n9_users.permissions text[]`. `auth-login` returns it in `user.permissions`. A shared `ADMIN_FEATURES` catalog (route key + label) drives the checkbox UI, the route guard, and the sidebar filter. `RoleGuard` gains a page check; `MenuService` filters items; Role Management gets a "Set Akses" dialog that writes `permissions` to `n9_users` via admin-proxy (service_role).

**Tech Stack:** Angular 22 (zoneless, signals, OnPush), PrimeNG (`p-dialog`, `p-checkbox`), Supabase (`n9_users`, `auth-login` Edge Function, `admin-proxy`), Cloudflare Pages.

**Verification:** build + lint + targeted `db query`/`curl` + (UI behind MFA) operator login check. No Karma culture here — use build + live checks.

**Spec:** `docs/superpowers/specs/2026-06-13-admin-page-permissions-design.md`

**Verified facts:**
- Menu routes (`menu.ts`, `Menu.pages[].items[].route`): `/overview`(always), `/users`, `/deposits`, `/withdrawals`, `/turnover`, `/manual`, `/transactions`, `/wallets`, `/3dking`, `/bets`, `/session-monitor`, `/gaming`, `/kyc`, `/referrals`, `/audit`, `/security-center`, `/risk-management`, `/ip-whitelist`, `/system`, `/role-management`, `/popup-banner`, `/cs-contact`.
- `MenuService` (`src/app/modules/layout/services/menu.service.ts`): `_pagesMenu = signal<MenuItem[]>([])` set from `Menu.pages.map(...)` in the constructor; `get pagesMenu()` returns it. `MenuItem` = `{ group, items: SubMenuItem[] }`; `SubMenuItem` = `{ icon, label, route, ... }`.
- `RoleGuard` (`src/app/core/guards/role.guard.ts`): has `user` (`{username, role, unlimited, permissions?}`), checks `requiredRole`/`requireUnlimited`, redirects to `/overview` on failure, has `getUserByUsername` server-verify pattern.
- `auth-login` returns `user: { id, email, username, role, isNewAccount }`; the `n9_users` select is `'id, username, password_hash, role'` (+ `is_active` added earlier).
- `AuthService.User` interface (`auth.service.ts:7`) has `role?`, `token?`, etc.
- admin registry: `admin.getAdminRegistry()` reads `n9_users`; `admin.updateUser`/proxy writes via service_role; `/n9_users` is in admin-proxy ALLOWED_PREFIXES.

---

## Task 1: DB — add `permissions` column to n9_users

**Files:** Create `supabase/migrations/20260613080000_n9_users_permissions.sql`.

- [ ] **Step 1: Write the migration**
```sql
-- Per-page access limits for admin accounts (NULL/empty = full access).
ALTER TABLE public.n9_users ADD COLUMN IF NOT EXISTS permissions text[];
```

- [ ] **Step 2: Apply + verify**
```bash
export PATH="$HOME/.local/share/supabase:$PATH"
cd /home/hemo/WEBSITE/N9NY-tailwind-N9
supabase db query --linked -f supabase/migrations/20260613080000_n9_users_permissions.sql
supabase db query --linked -o json "SELECT column_name FROM information_schema.columns WHERE table_name='n9_users' AND column_name='permissions';"
```
Expected: column `permissions` exists. All existing rows have `permissions = NULL` → full access unchanged.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260613080000_n9_users_permissions.sql
git commit -m "✨ db: n9_users.permissions text[] (limites d'accès par page admin)"
```

## Task 2: auth-login returns `permissions`

**Files:** Modify `supabase/functions/auth-login/index.ts`.

- [ ] **Step 1: Add `permissions` to the n9_users select**
Find the `.from('n9_users').select('id, username, password_hash, role')` (+ `.eq('is_active', true)`) and change the select to:
```ts
          .select('id, username, password_hash, role, permissions')
```

- [ ] **Step 2: Include `permissions` in the user response**
In the `return json({ success:true, ..., user: { id, email, username, role, isNewAccount: false } ... })`, add the field:
```ts
          user: {
            id: userRow.id,
            email: userRow.email || '',
            username: dbUsername,
            role: userRow.role,
            permissions: (n9Row?.data as { permissions?: string[] } | null)?.permissions ?? null,
            isNewAccount: false,
          },
```
(`n9Row` is the existing `await supabase.from('n9_users')...maybeSingle()` result; its `.data.permissions` is the array or null.)

- [ ] **Step 3: Deploy + verify (operator go)**
```bash
supabase functions deploy auth-login --project-ref dqsmpdetiqsqfnidekik
# hemo login → response.user has permissions (null for hemo):
curl -s -X POST "https://dqsmpdetiqsqfnidekik.supabase.co/functions/v1/auth-login" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $ANON_KEY" \
  -d '{"username":"hemo","password":"<pw>","email":"hemo@number9.local"}' \
  | python3 -c "import sys,json; print('permissions key present:', 'permissions' in json.load(sys.stdin).get('user',{}))"
```
Expected: `permissions key present: True`.

- [ ] **Step 4: Commit**
```bash
git add supabase/functions/auth-login/index.ts
git commit -m "✨ auth-login: renvoie user.permissions (depuis n9_users)"
```

## Task 3: ADMIN_FEATURES catalog constant

**Files:** Create `src/app/core/constants/admin-features.ts`.

- [ ] **Step 1: Write the catalog**
```ts
/** Pages that can be access-limited per admin (route key + label).
 *  /overview is intentionally excluded — always allowed (no lock-out). */
export interface AdminFeature {
  key: string; // route path, matches Menu.pages routes
  label: string;
}

export const ADMIN_FEATURES: AdminFeature[] = [
  { key: '/users', label: 'Management Member' },
  { key: '/deposits', label: 'Deposit' },
  { key: '/withdrawals', label: 'Withdraw' },
  { key: '/turnover', label: 'Turnover' },
  { key: '/manual', label: 'Saldo Manual' },
  { key: '/transactions', label: 'Transactions' },
  { key: '/wallets', label: 'Wallets' },
  { key: '/3dking', label: '3D King Engine' },
  { key: '/bets', label: 'Bet History' },
  { key: '/session-monitor', label: 'Session Monitor' },
  { key: '/gaming', label: 'Gaming Overview' },
  { key: '/kyc', label: 'KYC Verification' },
  { key: '/referrals', label: 'Referrals' },
  { key: '/audit', label: 'Audit Log' },
  { key: '/security-center', label: 'Security Center' },
  { key: '/risk-management', label: 'Risk Management' },
  { key: '/ip-whitelist', label: 'IP Whitelist' },
  { key: '/system', label: 'Configuration' },
  { key: '/role-management', label: 'Role Management' },
  { key: '/popup-banner', label: 'Popup Banners' },
  { key: '/cs-contact', label: 'CS Contact' },
];

export const ALWAYS_ALLOWED = ['/overview'];

/** Route-key for a URL: first path segment, e.g. '/deposits?x=1' → '/deposits'. */
export function routeKey(url: string): string {
  const path = (url || '').split('?')[0];
  const seg = path.split('/').filter(Boolean)[0];
  return seg ? `/${seg}` : '/overview';
}

/** Is `url` allowed for an account with these permissions?
 *  null/empty permissions = full access. superadmin handled by the caller. */
export function isPageAllowed(url: string, permissions: string[] | null | undefined): boolean {
  if (!permissions || permissions.length === 0) return true;
  const key = routeKey(url);
  return ALWAYS_ALLOWED.includes(key) || permissions.includes(key);
}
```

- [ ] **Step 2: Build (compiles)**
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run build 2>&1 | grep -E "complete|error" | head -2
```
Expected: bundle complete.

- [ ] **Step 3: Commit**
```bash
git add src/app/core/constants/admin-features.ts
git commit -m "✨ admin: catalogue ADMIN_FEATURES + helper isPageAllowed"
```

## Task 4: AuthService persists `permissions`

**Files:** Modify `src/app/core/services/auth.service.ts`.

- [ ] **Step 1: Add `permissions` to the `User` interface**
In `export interface User { ... }`, add:
```ts
  permissions?: string[] | null;
```

- [ ] **Step 2: Store it on login**
Wherever the login response is mapped to the stored `User` (the place that sets `role` from the auth-login `user` object), also set `permissions: resp.user.permissions ?? null`. (Find the assignment that reads `resp.user.role`/`data.user.role` and add the `permissions` field alongside it.)

- [ ] **Step 3: Build + commit**
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run build 2>&1 | grep -E "complete|error" | head -2
git add src/app/core/services/auth.service.ts
git commit -m "✨ auth: persiste user.permissions"
```

## Task 5: RoleGuard — page-permission check

**Files:** Modify `src/app/core/guards/role.guard.ts`.

- [ ] **Step 1: Import the helper** (top of file):
```ts
import { isPageAllowed } from 'src/app/core/constants/admin-features';
```

- [ ] **Step 2: Add the check** — immediately before `this.failedAttempts.delete(user.username);` (the success tail), insert:
```ts
      // Per-page access limit (superadmin bypasses; null/empty permissions = full)
      if (user.role !== 'superadmin' && !isPageAllowed(state.url, user.permissions)) {
        this.audit.logFailedAccess('ROUTE_GUARD', state.url, 'Page not in account permissions');
        this.router.navigate(['/overview']);
        return false;
      }
```

- [ ] **Step 3: Build + commit**
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run build 2>&1 | grep -E "complete|error" | head -2
git add src/app/core/guards/role.guard.ts
git commit -m "✨ admin: RoleGuard bloque les pages hors permissions (redirect /overview)"
```
Note: this guard runs on routes that already carry `canActivate: [RoleGuard]`. Routes without RoleGuard (if any) won't be page-limited — acceptable (the sidebar filter still hides them; confirm during execution whether all limitable routes use RoleGuard, add it where missing).

## Task 6: MenuService — filter sidebar by permissions

**Files:** Modify `src/app/modules/layout/services/menu.service.ts`.

- [ ] **Step 1: Inject AuthService + filter at build time**
Add imports:
```ts
import { inject } from '@angular/core';
import { AuthService } from 'src/app/core/services/auth.service';
import { isPageAllowed } from 'src/app/core/constants/admin-features';
```
In the constructor, replace the `this._pagesMenu.set(Menu.pages.map((m) => ({...})))` with a filtered build:
```ts
    const auth = inject(AuthService);
    const user = auth.getCurrentUser();
    const isSuper = user?.role === 'superadmin';
    const perms = user?.permissions;
    const visible = (route: string) => isSuper || isPageAllowed(route, perms);
    this._pagesMenu.set(
      Menu.pages
        .map((m) => ({
          group: m.group,
          separator: m.separator,
          items: m.items.filter((it) => !it.route || visible(it.route)),
        }))
        .filter((m) => m.items.length > 0),
    );
```
(Keep the rest of the existing mapping — icon/label/route — intact; only add the `.filter` on items and drop empty groups. Match the existing `MenuItem`/`SubMenuItem` field names exactly.)

- [ ] **Step 2: Build + commit**
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run build 2>&1 | grep -E "complete|error" | head -2
git add src/app/modules/layout/services/menu.service.ts
git commit -m "✨ admin: sidebar filtre les pages hors permissions"
```

## Task 7: admin.service — read/write permissions

**Files:** Modify `src/app/core/services/admin.service.ts`.

- [ ] **Step 1: Include permissions in the registry read**
Change `getAdminRegistry()`'s select to include `permissions`:
```ts
  getAdminRegistry() {
    return this.get<any>('n9_users', 'select=id,username,email,full_name,role,is_active,permissions&order=username.asc&limit=200');
  }
```

- [ ] **Step 2: Add the setter (dual-target n9_users only — permissions are admin-only)**
After `revokeAdmin(...)` (or near the other registry methods), add:
```ts
  /** Set per-page access limits for an admin (null/[] = full access). */
  setAdminPermissions(username: string, keys: string[] | null) {
    return this.proxy('PATCH', `/n9_users?username=eq.${encodeURIComponent(username)}`, {
      permissions: keys && keys.length ? keys : null,
    });
  }
```

- [ ] **Step 3: Build + commit**
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run build 2>&1 | grep -E "complete|error" | head -2
git add src/app/core/services/admin.service.ts
git commit -m "✨ admin.service: setAdminPermissions + registry inclut permissions"
```

## Task 8: Role Management — "Set Akses" dialog

**Files:** Modify `src/app/modules/dashboard/pages/role-management/role-management.component.ts`.

- [ ] **Step 1: Imports + AdminUser field**
Add to imports: `import { DialogModule } from 'primeng/dialog';` and `import { ADMIN_FEATURES } from 'src/app/core/constants/admin-features';`. Add `DialogModule` to the component `imports: [...]`. Extend the `AdminUser` interface with `permissions?: string[] | null;`.

- [ ] **Step 2: Component state + methods** — add to the class:
```ts
  readonly FEATURES = ADMIN_FEATURES;
  permDialogOpen = false;
  permTarget: AdminUser | null = null;
  permChecked: Record<string, boolean> = {};

  openPermissions(u: AdminUser) {
    this.permTarget = u;
    const set = new Set(u.permissions || []);
    const full = !u.permissions || u.permissions.length === 0;
    this.permChecked = {};
    for (const f of this.FEATURES) this.permChecked[f.key] = full ? true : set.has(f.key);
    this.permDialogOpen = true;
    this.cdr.markForCheck();
  }

  async savePermissions() {
    if (!this.permTarget) return;
    const keys = this.FEATURES.filter((f) => this.permChecked[f.key]).map((f) => f.key);
    // all checked → full access (store null)
    const value = keys.length === this.FEATURES.length ? null : keys;
    try {
      await this.admin.setAdminPermissions(this.permTarget.username, value);
      this.permTarget.permissions = value;
      this.notification.success('Akses disimpan', `${this.permTarget.username}: ${value ? value.length + ' halaman' : 'penuh'}`);
      this.permDialogOpen = false;
    } catch (e: unknown) {
      this.notification.error('Gagal', e instanceof Error ? e.message : 'Tidak bisa menyimpan akses.');
    }
    this.cdr.markForCheck();
  }
```

- [ ] **Step 3: Template — "Set Akses" button + dialog**
In the actions cell `@if (isSuperadmin && u.username !== currentUsername) { <div class="flex flex-wrap gap-1"> ... }`, add a button (after Revoke):
```html
                          <button
                            (click)="openPermissions(u)"
                            class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors">
                            Set Akses
                          </button>
```
Before the closing `</div>` of the template root (next to `<p-confirmdialog />`), add the dialog:
```html
      <p-dialog header="Batas Akses Halaman" [(visible)]="permDialogOpen" [modal]="true" [style]="{ width: '32rem' }">
        @if (permTarget) {
          <p class="text-muted-foreground mb-3 text-xs">
            Centang halaman yang boleh diakses <strong>{{ permTarget.username }}</strong>. Overview selalu boleh. Semua dicentang = akses penuh.
          </p>
          <div class="grid grid-cols-2 gap-2">
            @for (f of FEATURES; track f.key) {
              <label class="flex items-center gap-2 text-xs">
                <input type="checkbox" [(ngModel)]="permChecked[f.key]" />
                {{ f.label }}
              </label>
            }
          </div>
        }
        <div class="mt-4 flex justify-end gap-2">
          <button (click)="permDialogOpen = false" class="border-border rounded border px-3 py-1.5 text-sm">Batal</button>
          <button (click)="savePermissions()" class="rounded bg-yellow-400 px-3 py-1.5 text-sm font-bold text-black">Simpan</button>
        </div>
      </p-dialog>
```
(`FormsModule` is already imported for `ngModel`.)

- [ ] **Step 4: Build + lint + commit**
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run build 2>&1 | grep -E "complete|error" | head -2
npx eslint src/app/modules/dashboard/pages/role-management/role-management.component.ts 2>&1 | tail -3 || echo done
git add src/app/modules/dashboard/pages/role-management/role-management.component.ts
git commit -m "✨ admin: UI 'Set Akses' (batas akses par page) dans Role Management"
```

## Task 9: Deploy + verify

- [ ] **Step 1: Deploy Angular (operator go)**
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run deploy 2>&1 | tail -3
```

- [ ] **Step 2: Functional verify (with a test admin)**
- Set a non-superadmin admin's `permissions` to e.g. `{'/deposits','/withdrawals'}` via the "Set Akses" dialog (as hemo).
- DB check:
```bash
supabase db query --linked -o json "SELECT username, permissions FROM n9_users WHERE permissions IS NOT NULL;"
```
- Log that admin in (operator): sidebar shows only Overview + Deposit + Withdraw; visiting `/kyc` redirects to `/overview`. hemo (superadmin) still sees everything. Empty/null → all pages.
- Reset to full via the dialog (check all) and confirm the admin sees everything again.

---

## Self-Review

- **Spec coverage:** §2 storage→T1; §3.3 auth-login→T2; §3.1 catalog→T3; §3.4 AuthService→T4, guard→T5, sidebar→T6, Role Mgmt UI+service→T7/T8; default full + superadmin bypass + /overview→T3 helper (used by T5/T6); verify→T9. Covered.
- **Placeholder scan:** all code shown; T4 step 2 ("find the login-response mapping") references an existing assignment the engineer locates — acceptable (exact spot is the one setting `role` from `resp.user`). No TBD.
- **Type consistency:** `permissions: string[] | null` consistent across User (T4), AdminUser (T8), auth-login (T2), setAdminPermissions (T7). `isPageAllowed(url, permissions)` / `routeKey` signatures consistent T3↔T5↔T6. `ADMIN_FEATURES` shape `{key,label}` consistent T3↔T8.
- **Note:** this is **client-side** gating (guard + menu) — the intended scope (organize what each admin sees/uses). It is not a hard server boundary; admin DATA writes still go through admin-proxy/RPC role checks. Server-side per-page enforcement (admin-proxy) is a future hardening, out of scope here.
