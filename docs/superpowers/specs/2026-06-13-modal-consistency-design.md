# Modal/Dialog Visual Consistency — Design

**Date:** 2026-06-13
**App:** Angular admin (`/src`), `src/styles.css`
**Status:** Approved — CSS-only, implemented directly (spec doubles as plan)

## Problem
Admin uses 3 modal mechanisms (PrimeNG `p-dialog` ×4, PrimeNG `p-confirmdialog` ×10, bespoke Tailwind modals). The branded dark look (`#0e1017`, rounded-2xl, blur backdrop — see `app-confirm-dialog` / `.n9-logout-dialog`) is only applied to specific scoped classes; other PrimeNG dialogs render with default PrimeNG panel styling → inconsistent.

## Decision
**CSS-theme PrimeNG** (chosen over a full component migration): apply the branded look **globally** to all `.p-dialog` and `.p-confirmdialog` via `src/styles.css`. Same visual result as migrating, ~1 file, no component rewrites, low-risk, reversible.

## Design (additions to `src/styles.css`)
Global rules (alongside the existing `.p-dialog-mask` blur and the scoped `.n9-logout-dialog` / `.dashboard-dialog` variants, which stay and layer on top):
- `.p-dialog, .p-confirmdialog` — panel: `background:#0e1017; border:1px solid rgba(255,255,255,.06); border-radius:1rem; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,.6)`.
- `.p-dialog .p-dialog-header, .p-confirmdialog .p-dialog-header` — `background:#0e1017; border-bottom:1px solid rgba(255,255,255,.06); padding:1rem 1.25rem .85rem`.
- `.p-dialog-title` — `color:#f8fafc; font-weight:800; font-size:1rem`.
- `.p-dialog .p-dialog-content, .p-confirmdialog .p-dialog-content` — `background:#0e1017; color:#a1a1aa; padding:1rem 1.25rem`.
- `.p-dialog .p-dialog-footer, .p-confirmdialog .p-dialog-footer` — `background:#0e1017; border-top:1px solid rgba(255,255,255,.06); padding:.85rem 1.25rem 1.1rem`.
- Footer buttons (`.p-button`) — `border-radius:.75rem; font-weight:700` (PrimeNG severity colors kept for confirm/reject so action direction stays clear).
- Header close icon (`.p-dialog-header-icon`) — light/hover styles matching the dark theme.
- Existing `.n9-logout-dialog` (red-accented logout) keeps its specific overrides via higher specificity — unaffected.

## Verification
- `npm run build` clean. Screenshot a `p-dialog` (e.g. Set Akses / transaction detail) and a `p-confirmdialog` (a confirm) — both render dark/rounded-2xl/blur, matching the bespoke Tailwind modals.
- Live: rebuild + redeploy Angular.

## Out of scope
Migrating components off PrimeNG; restyling the bespoke Tailwind modals (already branded).
