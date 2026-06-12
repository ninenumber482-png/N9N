# 3D King Engine + System Control Upgrade (🟢+🟡) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline — only live step is the final Angular deploy). Steps use checkbox (`- [ ]`).

**Goal:** Add branded confirmations before risky engine/system actions, clearer phase/state badges, and read-only engine-health/override readouts — **without touching settlement logic, `settle_session`, `king_planned` write semantics, timing constants, or the auto-engine.**

**Architecture:** Wrap existing actions (`overrideCategory`, `toggleMaintenance`, `toggleKing`) in PrimeNG `p-confirmdialog` (now globally branded). Add `app-status-badge` for phase/state. Add two read-only reads (`admin.getLatestKingResult`, current-session `king_planned`) for health + override readouts. Pure Angular; no DB/Edge/engine change.

**Tech Stack:** Angular 22 (zoneless, OnPush), PrimeNG (`ConfirmDialogModule`/`ConfirmationService`), shared `StatusBadgeComponent`, admin-proxy reads.

**Verification:** build + lint clean; operator login (MFA) to confirm dialogs fire + readouts render + auto-engine still settles. No headless UI (behind MFA).

**Spec:** `docs/superpowers/specs/2026-06-13-engine-system-upgrade-green-yellow-design.md`

**Verified facts:**
- 3dking `imports: [CommonModule, AngularSvgIconModule, PageHeaderComponent]` (line 144); injects admin/cdr/notification (line 370-372). Force buttons `(click)="overrideCategory(s.code, 'bs'|'oe', 'BIG'|'SMALL'|'ODD'|'EVEN')"` inside `@if (s.editable)`; `overrideCategory(code, axis, value)` at line 651. Status card shows `{{ currentStatus }}` (phase text) ~line 157, `{{ fmtTimer(currentCountdown) }}` ~161.
- system `toggleKing()` (line 409) + `toggleMaintenance()` (427) — no confirm, no ConfirmationService import.
- `StatusBadgeComponent` from `src/app/shared/components/status-badge/status-badge.component`; usage `<app-status-badge [value]="x" [severity]="'success'|'warn'|'info'|'secondary'" />` (see role-management/session-monitor).
- `king_results` columns include `session_code, created_at`; `king_planned` keyed by `session_code` with `d1,d2,d3`.

---

## Task 1: 3dking — confirm before Force override (🟢, safety-critical)

**Files:** Modify `src/app/modules/dashboard/pages/3dking/3dking.component.ts`.

- [ ] **Step 1: Imports + providers + inject**
Add imports:
```ts
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
```
Add `ConfirmDialogModule` to the component `imports: [...]`. Add `providers: [ConfirmationService]` to the `@Component` decorator (next to `imports`). In the class, inject: `private confirmation = inject(ConfirmationService);`.

- [ ] **Step 2: confirmOverride method** — add near `overrideCategory` (line ~651):
```ts
  confirmOverride(code: string, axis: 'bs' | 'oe', value: string) {
    this.confirmation.confirm({
      message: `Paksa <strong>${value}</strong> untuk sesi <strong>${this.displayCode(code)}</strong>? Ini meng-override hasil undian secara manual.`,
      header: 'Konfirmasi Override',
      rejectLabel: 'Batal',
      acceptLabel: `Paksa ${value}`,
      accept: () => this.overrideCategory(code, axis, value),
    });
  }
```
(`displayCode` already exists in the component for N9K- display; if the method name differs, use the existing code→display helper, else show `code` raw.)

- [ ] **Step 3: Point the 4 Force buttons at confirmOverride**
Replace each `(click)="overrideCategory(s.code, 'bs', 'BIG')"` → `(click)="confirmOverride(s.code, 'bs', 'BIG')"`, and the same for `'SMALL'`, `('oe','ODD')`, `('oe','EVEN')`.

- [ ] **Step 4: Add `<p-confirmdialog />`** — at the end of the template root `<div data-page="3dking" ...> ... </div>`, before its closing tag:
```html
      <p-confirmdialog />
```

- [ ] **Step 5: Build + commit**
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run build 2>&1 | grep -E "complete|error|NG[0-9]" | head
git add src/app/modules/dashboard/pages/3dking/3dking.component.ts
git commit -m "✨ 3dking: confirmation branded avant Force override (anti-misclick)"
```

## Task 2: 3dking — phase badge (🟢 visual)

**Files:** Modify `3dking.component.ts`.

- [ ] **Step 1: Import StatusBadge**
```ts
import { StatusBadgeComponent } from 'src/app/shared/components/status-badge/status-badge.component';
```
Add `StatusBadgeComponent` to `imports`.

- [ ] **Step 2: Phase→severity helper** — add to the class:
```ts
  phaseSeverity(phase: string): 'success' | 'warn' | 'info' | 'secondary' {
    switch (phase) {
      case 'OPEN': return 'success';
      case 'LOCKED': return 'warn';
      case 'RESULTING': return 'info';
      default: return 'secondary'; // NEXT, SETTLED, unknown
    }
  }
```

- [ ] **Step 3: Replace the phase text with a badge** — in the status card, change the Phase cell `<p class="text-foreground">{{ currentStatus || '-' }}</p>` to:
```html
            <app-status-badge [value]="currentStatus || '-'" [severity]="phaseSeverity(currentStatus)" />
```

- [ ] **Step 4: Build + commit**
```bash
npm run build 2>&1 | grep -E "complete|error" | head
git add src/app/modules/dashboard/pages/3dking/3dking.component.ts
git commit -m "💄 3dking: phase en badge coloré (NEXT/OPEN/LOCKED/RESULTING/SETTLED)"
```

## Task 3: 3dking — engine-health + manual-override readout (🟡 read-only)

**Files:** Modify `src/app/core/services/admin.service.ts` + `3dking.component.ts`.

- [ ] **Step 1: admin.service reads** — add:
```ts
  getLatestKingResult() {
    return this.get<any>('king_results', 'select=session_code,created_at&order=session_code.desc&limit=1');
  }
  getPlannedForSession(code: string) {
    return this.get<any>('king_planned', `session_code=eq.${encodeURIComponent(code)}&select=session_code,d1,d2,d3&limit=1`);
  }
```

- [ ] **Step 2: 3dking — health + override state fields + loader** — add to the class:
```ts
  engineHealthy = true;
  lastSettleAt: string | null = null;
  overrideActive = false;

  private async loadEngineMeta() {
    try {
      const r = await this.admin.getLatestKingResult();
      const ts = r?.[0]?.created_at as string | undefined;
      this.lastSettleAt = ts ?? null;
      // auto-engine considered healthy if a result landed within ~1.3 sessions
      this.engineHealthy = !!ts && Date.now() - new Date(ts).getTime() < 390_000;
    } catch {
      this.engineHealthy = false;
    }
    this.cdr.markForCheck();
  }
```
Call `this.loadEngineMeta();` in `ngOnInit` (after the existing init) and on the existing refresh interval if there is one (otherwise once is fine). For the override badge, set `this.overrideActive` when the current session's `king_planned` row exists — inside the place that computes the current session, call `this.admin.getPlannedForSession(currentCode)` and set `this.overrideActive = !!rows?.length`. (If wiring into the existing session-compute is intricate, a standalone `loadOverrideState(code)` method called alongside `loadEngineMeta` is acceptable.)

- [ ] **Step 3: Render the badges** — in the status card, add a row/cell:
```html
          <div>
            <p class="text-muted-foreground uppercase tracking-wider mb-0.5">Auto-Engine</p>
            <app-status-badge
              [value]="engineHealthy ? 'OK' : 'STALE'"
              [severity]="engineHealthy ? 'success' : 'warn'" />
            @if (overrideActive) {
              <span class="ml-2 inline-flex items-center rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">OVERRIDE</span>
            }
          </div>
```
(Adjust the status card grid from `grid-cols-4` to `grid-cols-5` if adding a 5th cell.)

- [ ] **Step 4: Build + commit**
```bash
npm run build 2>&1 | grep -E "complete|error" | head
git add src/app/core/services/admin.service.ts src/app/modules/dashboard/pages/3dking/3dking.component.ts
git commit -m "✨ 3dking: indicateur auto-engine health + badge override manuel (read-only)"
```

## Task 4: System Control — confirm before Maintenance/Marketplace toggle (🟢)

**Files:** Modify `src/app/modules/dashboard/pages/system/system.component.ts`.

- [ ] **Step 1: Imports + providers + inject**
```ts
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
```
Add `ConfirmDialogModule` to `imports`, `providers: [ConfirmationService]`, and `private confirmation = inject(ConfirmationService);`.

- [ ] **Step 2: Confirm wrappers** — add:
```ts
  confirmToggleMaintenance() {
    const enabling = !this.maintenanceMode;
    this.confirmation.confirm({
      message: enabling
        ? 'Aktifkan Maintenance? Ini <strong>memblokir SEMUA user</strong> dari platform.'
        : 'Nonaktifkan Maintenance dan buka kembali akses user?',
      header: enabling ? 'Aktifkan Maintenance' : 'Nonaktifkan Maintenance',
      rejectLabel: 'Batal',
      acceptLabel: enabling ? 'Aktifkan' : 'Nonaktifkan',
      accept: () => this.toggleMaintenance(),
    });
  }
  confirmToggleKing() {
    const enabling = !this.kingEnabled;
    this.confirmation.confirm({
      message: `${enabling ? 'Aktifkan' : 'Nonaktifkan'} marketplace 3D King?`,
      header: 'Marketplace Control',
      rejectLabel: 'Batal',
      acceptLabel: enabling ? 'Aktifkan' : 'Nonaktifkan',
      accept: () => this.toggleKing(),
    });
  }
```
(Use the existing state field for marketplace — find the one `toggleKing` reads/writes; if it's not `kingEnabled`, use that field name. If no boolean state exists, drop the `enabling` ternary and use a generic message.)

- [ ] **Step 3: Point the toggle buttons at the confirm wrappers**
Change `(click)="toggleMaintenance()"` → `(click)="confirmToggleMaintenance()"` and `(click)="toggleKing()"` → `(click)="confirmToggleKing()"`.

- [ ] **Step 4: Add `<p-confirmdialog />`** at the end of the template root div.

- [ ] **Step 5: Build + commit**
```bash
npm run build 2>&1 | grep -E "complete|error|NG[0-9]" | head
git add src/app/modules/dashboard/pages/system/system.component.ts
git commit -m "✨ system: confirmation avant toggle Maintenance (blocage users) + Marketplace"
```

## Task 5: System Control — state badges + last-settlement readout (🟢 visual + 🟡)

**Files:** Modify `system.component.ts`.

- [ ] **Step 1: Import StatusBadge** (`StatusBadgeComponent`, add to `imports`).

- [ ] **Step 2: Last-settlement field + loader** (reuse `admin.getLatestKingResult`):
```ts
  lastSettleAt: string | null = null;
  engineHealthy = true;
  private async loadEngineMeta() {
    try {
      const r = await this.admin.getLatestKingResult();
      const ts = r?.[0]?.created_at as string | undefined;
      this.lastSettleAt = ts ?? null;
      this.engineHealthy = !!ts && Date.now() - new Date(ts).getTime() < 390_000;
    } catch { this.engineHealthy = false; }
    this.cdr.markForCheck();
  }
```
Call `this.loadEngineMeta();` in the existing `ngOnInit`/load.

- [ ] **Step 3: Render badges** — replace the maintenance ON/OFF `<span>{{ maintenanceMode ? 'On' : 'Off' }}</span>` with:
```html
                <app-status-badge [value]="maintenanceMode ? 'ON' : 'OFF'" [severity]="maintenanceMode ? 'warn' : 'secondary'" />
```
In the Engine Status section, add:
```html
            <app-status-badge [value]="engineHealthy ? 'Auto-engine OK' : 'Auto-engine STALE'" [severity]="engineHealthy ? 'success' : 'warn'" />
            <p class="text-[11px] text-muted-foreground mt-1">Last settlement: {{ lastSettleAt ? (lastSettleAt | wibDate: 'short') : '-' }}</p>
```
(Add `WibDatePipe` to `imports` if not already there — check the existing imports.)

- [ ] **Step 4: Build + lint + commit**
```bash
npm run build 2>&1 | grep -E "complete|error" | head
npx eslint src/app/modules/dashboard/pages/system/system.component.ts 2>&1 | tail -3 || echo done
git add src/app/modules/dashboard/pages/system/system.component.ts
git commit -m "💄 system: badges état (Maintenance/engine) + dernier settlement"
```

## Task 6: Deploy + verify

- [ ] **Step 1: Deploy Angular (operator go)**
```bash
cd /home/hemo/WEBSITE/N9NY-tailwind-N9 && npm run deploy 2>&1 | tail -3
```

- [ ] **Step 2: Operator verify (login + MFA)**
- 3D King Engine: click a Force button → branded confirmation appears; accepting performs the same override as before (verify a session's `king_planned` got the value, exactly like pre-upgrade). Phase shows as a colored badge. Auto-Engine badge = OK; OVERRIDE badge appears when a manual override is set.
- System Control: toggling Maintenance → confirmation with the "blocks ALL users" warning; ON/OFF badges render; last-settlement + engine-health show.
- **Auto-engine intact:** watch one session cycle settle automatically with no manual action — confirms nothing in the engine changed.

---

## Self-Review
- **Spec coverage:** A1 confirm override→T1; A2 phase badge→T2; A3 disable-when-past-LOCKED — note: Force buttons already render only under `@if (s.editable)` (the existing phase guard), so explicit `[disabled]` is redundant; T1/T2 keep that guard. B4 health→T3; B5 override readout→T3; C6/C7 confirms→T4; C8 badges→T5; D9 readout→T5; deploy/verify→T6. Covered.
- **Placeholder scan:** code shown; the two "find the existing field/method name" notes (displayCode, kingEnabled) are concrete lookups the executor resolves against the file — acceptable.
- **Type consistency:** `getLatestKingResult`/`getPlannedForSession` used in T3/T5 match admin.service defs (T3 step1). `phaseSeverity`/severity union consistent. `loadEngineMeta` identical shape in 3dking (T3) + system (T5).
- **No settlement-logic change:** every task only wraps actions in confirm, adds badges, or reads read-only. `overrideCategory`/`toggleMaintenance`/`toggleKing`/`settle_session`/`king_planned` write paths untouched.
