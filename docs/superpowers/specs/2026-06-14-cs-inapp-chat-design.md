# Customer Service — In-App Ticket Chat (Full-Stack)

- **Date:** 2026-06-14
- **Status:** Design approved — pending spec review
- **Scope:** New full-stack feature — Supabase (tables + RPCs), React user app (Support page + widget), Angular admin (tickets inbox). Plus a correctness pass on the existing WhatsApp/Telegram CS channels.
- **Related:** Builds on the CS widget work in commit `eef9a34` (`get_cs_contact()`, login-only widget). Reuses the `get_user_id()` token pattern and `upload-proof` edge function.

---

## 1. Background & Problem

Today's CS is: (a) external redirect links (WhatsApp/Telegram) via the login-only widget, and (b) a fire-and-forget `support_tickets` form — single message, **user never sees it again**, and **no admin UI exists** to read or reply. There is no conversation.

This feature adds a real **in-app ticket chat**: a user opens a ticket (subject + category), exchanges threaded messages with an admin, sees status, gets unread indicators, and can attach images. Admins get an inbox to triage and reply. The external WhatsApp/Telegram channels remain as a third option and are verified for correctness.

Decisions locked with the user:
- **Conversation model:** ticket-threaded (not continuous 1:1 chat).
- **v1 includes:** unread badges (last-read tracking), image attachments, anti-spam (rate-limit + length cap).
- **Live updates:** polling-based near-live (auth-model constraint — see §6).
- **Closed tickets:** terminal for the user (new ticket to continue); admin can reopen.
- **Excluded (YAGNI v1):** auto-reopen on user reply, multi-agent assignment, typing indicators, read-receipts beyond unread badge.

## 2. Goals

- User: list own tickets, open a thread, send/receive messages (with optional image), see unread state, create new tickets — all gated to their own session.
- Admin: inbox of all tickets (filter by status/category), open a thread, reply (with optional image), change status (REPLIED/CLOSED/reopen), unread highlight + sidebar open-count badge.
- Near-live updates without exposing data to anon or relying on Supabase Auth.
- WhatsApp + Telegram links verified accurate and functional.

## 3. Non-Goals

- True websocket realtime for the user side (needs Supabase-Auth JWT migration — out of scope).
- Auto-reopen, agent assignment/routing, canned replies, SLA timers, multi-image per message.

## 4. Data Model (migration — additive)

**Extend `support_tickets`** (keep all existing columns):
```sql
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS last_message_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_sender       text CHECK (last_sender IN ('USER','ADMIN')),
  ADD COLUMN IF NOT EXISTS user_last_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_last_read_at timestamptz;
```
The original `message` column stays (snapshot of the first message); the first message is **also** inserted as a `ticket_messages` row so the thread is uniform.

**New `ticket_messages`:**
```sql
CREATE TABLE IF NOT EXISTS ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('USER','ADMIN')),
  sender_id   uuid,                       -- users.id (USER) or admin user id (ADMIN)
  body        text NOT NULL DEFAULT '',
  image_url   text,                       -- optional attachment (upload-proof URL)
  created_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id, created_at);
```

**Access:** RLS-by-`auth.uid()` does not fit this platform (custom token → `auth.uid()` is NULL). So both tables are **RPC-only** for users:
```sql
-- ticket_messages is created with NO anon/authenticated grants → RPC-only from birth (safe anytime).
REVOKE ALL ON ticket_messages FROM anon, authenticated;
-- support_tickets: ensure no anon/authenticated SELECT/UPDATE/DELETE (reads/writes via RPC).
-- The one exception is the EXISTING anon INSERT grant, which the current live form relies on —
-- its revoke is deferred to a trailing migration (see §14) so it lands AFTER the new frontend.
-- service_role (admin-proxy) keeps full access throughout.
```

## 5. Backend RPCs (user side — SECURITY DEFINER, `get_user_id()`-gated)

All return `{'error':'NO_SESSION'}` (or `[]`) when `get_user_id()` is NULL. `search_path = public, extensions`. Granted EXECUTE to anon, authenticated, service_role.

| RPC | Behavior |
|---|---|
| `create_ticket(p_subject, p_category, p_message, p_image_url)` | `check_rate_limit(uid,'TICKET_NEW',…)`; length-cap subject/message; insert `support_tickets` (status OPEN, last_sender USER, last_message_at now, user_last_read_at now) + first `ticket_messages` (USER). Returns `{id}`. |
| `get_my_tickets()` | Returns user's tickets: header + last message preview + `unread` boolean, where **unread = `last_sender = 'ADMIN' AND last_message_at > user_last_read_at`**. Ordered by `last_message_at DESC`. |
| `get_ticket_thread(p_ticket_id)` | Ownership-checked; returns all `ticket_messages` ASC; stamps `user_last_read_at = now()`. |
| `send_ticket_message(p_ticket_id, p_body, p_image_url)` | Ownership-checked; **reject if status=CLOSED** (`TICKET_CLOSED`); `check_rate_limit(uid,'TICKET_MSG',…)`; length-cap body; insert USER message; update ticket (status OPEN, last_sender USER, last_message_at now, user_last_read_at now). |
| `get_my_ticket_unread_count()` | Lightweight count of tickets where `last_sender='ADMIN' AND last_message_at > user_last_read_at`. For the nav badge. |

**Admin side** (via existing `admin-proxy`, service_role — add `/support_tickets` and `/ticket_messages` to `ALLOWED_PREFIXES`):
- List/read: `GET /support_tickets?...`, `GET /ticket_messages?ticket_id=eq.<id>&order=created_at.asc`.
- Reply: `POST /ticket_messages` (sender_type ADMIN, sender_id = admin id) + `PATCH /support_tickets?id=eq.<id>` (status REPLIED, last_sender ADMIN, last_message_at now, admin_last_read_at now).
- Status change/reopen: `PATCH /support_tickets` (status CLOSED / OPEN).
- Open-count badge: `GET /support_tickets?status=neq.CLOSED&select=count`.

## 6. Live Updates — polling near-live (Judgment call A, finalized)

This platform authenticates users with a custom `x-user-token` (→ `users.session_token`), **not** Supabase Auth JWTs. RLS-gated per-user realtime can't be secured for the anon-key client (same reason Phase 2 used polling). Therefore:

- **User, thread open:** poll `get_ticket_thread(ticket_id)` every **~3.5s** + immediately on `window` focus. Stop polling when the thread view unmounts.
- **User, ticket list / nav badge:** poll `get_my_tickets` (list view) / `get_my_ticket_unread_count` (global nav badge) every **~15s**.
- **Admin inbox:** use the existing `RealtimeService` (realtime + 5s polling fallback) on `support_tickets`; treat events as "refetch" triggers (the established empty-payload→poll pattern).

Realtime events are a bonus where they fire; correctness never depends on them.

## 7. User UI — React `SupportPage.jsx` rework

Replace the one-shot form with three states in one page:
- **My Tickets list:** cards from `get_my_tickets` (subject, category chip, status pill, last-message preview, relative time, **unread dot**). Empty state + "New Ticket" button.
- **Thread view:** chat bubbles (USER right / ADMIN left), image thumbnails (tap to enlarge), date separators; reply box at bottom (textarea + image attach + send) — **hidden/disabled when CLOSED** with a "buat tiket baru" note. Polls every ~3.5s.
- **New Ticket modal:** subject + category (existing `CATEGORIES`) + message + optional image → `create_ticket` → opens the new thread.
- **Nav unread badge:** Support menu item shows a count from `get_my_ticket_unread_count` (polled ~15s; cleared when a thread is read).
- **CsWidget:** add a third option **"Live Chat (in-app)"** above WhatsApp/Telegram that routes to `…/support`. Widget stays login-only.

New helper `utils/tickets.js` wrapping the RPCs (returns plain objects / `{error}`); no link/data persisted to localStorage.

## 8. Admin UI — new Angular tickets page

New standalone page `src/app/modules/dashboard/pages/tickets/tickets.component.ts` (inline template, OnPush, `cdr.markForCheck()`):
- **List:** PrimeNG table/cards — filter by status (`p-select`) + category + search; unread rows highlighted; `p-paginator`.
- **Detail dialog/panel:** thread (admin left-styled, user right), reply box + image attach (`upload-proof`), status controls (Mark REPLIED auto on reply, Close, Reopen) via `p-confirmdialog` for destructive/close.
- **Service:** add to `admin.service.ts` — `getTickets(filter)`, `getTicketThread(id)`, `replyTicket(id, body, imageUrl, adminId)`, `setTicketStatus(id, status)`, `getOpenTicketCount()` (all through `proxy`).
- **Wiring:** route in `dashboard-routing.module.ts`; entry in `menu.ts` (Members group: "Support Tickets"); add to `PAGE_ORDER` in `dashboard.component.ts`; sidebar badge (open-ticket count) in `sidebar.component.ts` `refreshBadges()` + `menuService.updateBadges({ '/tickets': n })`.

## 9. Attachments

One optional image per message. Client uploads via the existing `upload-proof` edge function (returns a URL); the URL is passed as `p_image_url` (user RPC) or `image_url` (admin POST). Image rendered as a thumbnail in the bubble; click to view full. Validate type (image/*) and size client-side (≤5MB, matching deposit proof).

## 10. Anti-spam

- `check_rate_limit(uid, 'TICKET_NEW', e.g. 5/10min)` in `create_ticket`; `check_rate_limit(uid, 'TICKET_MSG', e.g. 20/min)` in `send_ticket_message`.
- Body length cap (e.g. 2000 chars) and subject cap (e.g. 120 chars) enforced **in the RPC** (not just UI).

## 11. WhatsApp / Telegram correctness pass (user-added requirement)

Verify and harden the existing channels (no behavior regression to the shipped widget):
- **WhatsApp:** link must be `https://wa.me/<digits-only>?text=<encodeURIComponent(welcome)>`; strip `+`/spaces/dashes from the number. Confirm in `csContact.js` (already strips) and add the same normalization safety in admin save.
- **Telegram:** link must be a full `https://t.me/...` URL. **Validate format on admin save** (`cs-contact.component.ts`) — reject/flag malformed links so a bad link can't ship.
- **Toggles:** `cs_wa_active` / `cs_telegram_active` each gate their button; both off (or master off) → widget hidden. Confirm via the existing `get_cs_contact` shape.
- **No stale links:** confirm in-memory-only cache (already done) — re-verify after admin toggles.
- The in-app chat appears as the third channel in the widget.

## 12. Security

- Every user read/write goes through a `get_user_id()`-gated SECURITY DEFINER RPC, scoped to the caller's own tickets — no cross-user access.
- `support_tickets` + `ticket_messages` carry no anon SELECT; direct anon INSERT on `support_tickets` is revoked (writes go through `create_ticket`).
- Admin access is service_role via admin-proxy (admin-session-gated), unaffected by anon revokes.
- Rate-limit + length caps enforced server-side.

## 13. Testing

- Anon: cannot read/write tickets (RPCs return NO_SESSION; tables not anon-selectable).
- User A cannot read/post to User B's ticket (ownership check).
- Create → thread → reply round-trip; image attach renders.
- Admin reply appears in user thread within one poll cycle (~3.5s); unread badge increments then clears on open.
- CLOSED ticket: user reply blocked; admin reopen works.
- Rate-limit trips on flooding; over-length body rejected by RPC.
- Sidebar open-count badge accurate; `PAGE_ORDER`/menu in sync.
- WhatsApp link opens correct chat; Telegram link valid; both toggles hide/show correctly.
- Mobile + desktop (user page + admin page).

## 14. Constraints & Deploy Ordering

- Migrations **written but NOT applied to live** by the implementer (standing rule). 
- **Apply order:** (1) additive migration — new table, columns, RPCs — safe to apply anytime, apply first so RPCs exist; deploy admin (with admin-proxy allowlist update) and user frontend; (2) the **revoke of direct anon INSERT** on `support_tickets` applied **after** the new user frontend (which uses `create_ticket`) is live, so the old direct-insert form can't break.
- No changes to existing RPC signatures; follow existing zoneless/OnPush + PrimeNG admin patterns and React/Zustand patterns.

## 15. File-level change summary

- **Supabase:** `…_cs_ticket_chat.sql` (tables/columns/RPCs/grants), `…_revoke_anon_support_insert.sql` (trailing revoke); `admin-proxy/index.ts` allowlist + audit covers POST/PATCH.
- **React:** `pages/SupportPage.jsx` (rework), `utils/tickets.js` (new), `components/ui/CsWidget.jsx` (third channel), nav badge wiring (`components/Layout.jsx`), i18n (en/id).
- **Angular:** `pages/tickets/tickets.component.ts` (new), `admin.service.ts` (methods), `dashboard-routing.module.ts`, `core/constants/menu.ts`, `dashboard.component.ts` (PAGE_ORDER), `components/sidebar/sidebar.component.ts` (badge), `cs-contact.component.ts` (Telegram URL validation).
