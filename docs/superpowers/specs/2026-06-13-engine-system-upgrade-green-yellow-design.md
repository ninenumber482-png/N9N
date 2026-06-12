# 3D King Engine + System Control — Upgrade (🟢 safe + 🟡 medium) — Design

**Date:** 2026-06-13
**App:** Angular admin — `3dking.component.ts` (803 lines), `system.component.ts` (477 lines)
**Status:** Approved scope (🟢+🟡); 🔴 engine-logic features deferred (see memory `engine-upgrade-backlog`).

## Goal
Modernize the visual + reliability/UX of the two operational pages **without touching settlement logic or the auto-engine**. The auto draw/settlement (pg_cron + EC2 bot) keeps running exactly as-is; this upgrade only adds confirmations, clearer status, and read-only health/override readouts.

## Non-negotiable constraint
**No change to settlement logic, `settle_session`, `king_planned` write semantics, session timing constants, or the auto-engine.** Confirmations only *wrap* existing admin actions (same action, asked first). All new readouts are read-only. Shared constants (`SESSION_MS`/`LOCK_MS`) untouched.

## Current state (verified)
- 3dking Force buttons call `overrideCategory(code, 'bs'|'oe', 'BIG'|'SMALL'|'ODD'|'EVEN')` **with no confirmation** → a misclick instantly forces a manual draw override.
- system `toggleKing()` (marketplace) and `toggleMaintenance()` (**blocks ALL users**) have **no confirmation** and don't import `ConfirmationService`.
- Modals are now globally branded (dark/rounded/blur) — confirmations will be visually consistent.

## Design

### A. 3D King Engine — 🟢
1. **Confirm before Force override.** Wrap `overrideCategory(...)` calls in a branded `p-confirmdialog` (`ConfirmationService`): message names the session code + the forced category (e.g. "Paksa **BIG** untuk sesi **N9K-…**? Ini override hasil undian manual."). On accept → call the existing `overrideCategory`. Add `ConfirmDialogModule` + `ConfirmationService` to the component (PrimeNG, already used elsewhere). No change to `overrideCategory` itself.
2. **Phase badge.** Replace the plain `{{ currentStatus }}` text in the status card with `<app-status-badge>` colored by phase: NEXT=secondary, OPEN=success, LOCKED=warn, RESULTING=info, SETTLED=secondary. Bigger countdown (mono, larger). Keep the data bindings as-is.
3. **Disable Force when inappropriate** (UX guard, not logic): disable Force buttons when the row's phase is past LOCKED (`RESULTING`/`SETTLED`) — purely a `[disabled]` binding; the underlying action is unchanged.

### B. 3D King Engine — 🟡 (read-only)
4. **Engine health indicator.** A small badge in the status card: read the latest `king_results.created_at` (newest settled session); if within ~`SESSION_MS*1.3` of now → "Auto-engine: OK", else "Auto-engine: stale (cek pg_cron/EC2)". Read-only (`admin` REST GET on `king_results` latest, which already happens in realtime.service). New `admin.getLatestKingResult()` if needed.
5. **Manual-override readout.** For the active/next session, if a `king_planned` row has admin-set digits/category, show a "Manual override aktif" badge (read `king_planned` for the current session code). Read-only.

### C. System Control — 🟢
6. **Confirm before Maintenance toggle.** Wrap `toggleMaintenance()` in `p-confirmdialog` with a strong warning ("Aktifkan Maintenance? Ini **blokir SEMUA user** dari platform." / "Nonaktifkan Maintenance?"). On accept → existing `toggleMaintenance()`.
7. **Confirm before Marketplace toggle.** Wrap `toggleKing()` similarly.
8. **Visual:** consistent section cards; ON/OFF state via `<app-status-badge>` (success/secondary) for maintenance + marketplace.

### D. System Control — 🟡 (read-only)
9. **Status readout:** show current session code + last settlement time (latest `king_results`) + auto-engine health (same as B4) in/near the Engine Status section. Read-only.

## Live impact
- Angular rebuild + redeploy only. **No DB writes, no Edge Function, no engine/settlement change.** Confirmations and readouts only.

## Verification
- build + lint clean.
- Behind login+MFA (operator): Force a category → confirmation appears, accepting performs the same override as before; toggling Maintenance → confirmation with the all-users warning; phase badge + health/override readouts render. Screenshot.
- Confirm the auto-engine still settles (a session settles normally with no manual action) — observe a session cycle.

## Out of scope (deferred — 🔴, see memory `engine-upgrade-backlog`)
Manual d1/d2/d3 override, session-timing controls, re-settle/correction. Each = its own careful spec + heavy testing; auto-engine must keep running.
