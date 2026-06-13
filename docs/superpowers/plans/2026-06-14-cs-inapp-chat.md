# Customer Service In-App Ticket Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-stack, ticket-threaded in-app customer-service chat (user ↔ admin) with unread badges, image attachments, and anti-spam, plus a correctness pass on the existing WhatsApp/Telegram channels.

**Architecture:** Extend `support_tickets` and add a child `ticket_messages` table. All user reads/writes go through `get_user_id()`-gated SECURITY DEFINER RPCs (custom `x-user-token` auth — no Supabase-Auth/RLS-by-uid). Admin reads/writes go through the existing `admin-proxy` (service_role). Near-live updates via polling (3.5s open thread / 15s list+badge) because the custom-token model can't secure per-user websocket RLS. React user UI reworks `SupportPage.jsx`; Angular admin gets a new `/tickets` page.

**Tech Stack:** Supabase Postgres (plpgsql SECURITY DEFINER RPCs), Deno edge function (`admin-proxy`), React 19 + Zustand + Vite (user app), Angular 22 zoneless + PrimeNG (admin app).

**Verification model (read first):** This repo has **no JS unit-test runner** and the migrations are **not applied to live** (standing rule) and admin login is 2FA-gated. So each task is verified by: (a) SQL **check-queries** to run *after* the engineer applies the migration to a local/test Supabase project, (b) `npm run build` (both apps) and `npx eslint <file>` for frontend, and (c) targeted manual/Playwright smoke where noted. Do **not** apply migrations to the live project `dqsmpdetiqsqfnidekik`.

**Shared data contracts (used across tasks — keep names exact):**
- Ticket header (from `get_my_tickets` / admin list): `{ id, subject, category, status, last_message_at, last_sender, last_message_preview, unread }`
- Thread message (from `get_ticket_thread` / admin messages): `{ id, sender_type, body, image_url, created_at }`
- `get_ticket_thread` returns: `{ ticket: { id, subject, category, status }, messages: ThreadMessage[] }` or `{ error }`
- `create_ticket` returns: `{ id }` or `{ error }`
- `send_ticket_message` returns: `{ id }` or `{ error }` (errors: `NO_SESSION`, `NOT_OWNER`, `TICKET_CLOSED`, `RATE_LIMIT`, `TOO_LONG`)
- `get_my_ticket_unread_count` returns: `{ count: <int> }`

---

## Phase A — Database (Supabase)

### Task A1: Migration — tables, columns, indexes

**Files:**
- Create: `supabase/migrations/20260614050000_cs_ticket_chat_schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- CS in-app ticket chat — schema (additive). NOT YET APPLIED to production.
-- Extends support_tickets with thread/read-tracking columns + adds
-- ticket_messages. Access is RPC-only (custom x-user-token auth; auth.uid()
-- is NULL here so RLS-by-uid is not used). See 20260614060000 for RPCs and
-- 20260614070000 for the trailing anon-INSERT revoke.
-- ============================================================================

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS last_message_at    timestamptz,
  ADD COLUMN IF NOT EXISTS last_sender        text,
  ADD COLUMN IF NOT EXISTS user_last_read_at  timestamptz,
  ADD COLUMN IF NOT EXISTS admin_last_read_at timestamptz;

-- last_sender constraint (separate so re-runs don't fail if column already existed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_last_sender_chk'
  ) THEN
    ALTER TABLE public.support_tickets
      ADD CONSTRAINT support_tickets_last_sender_chk
      CHECK (last_sender IS NULL OR last_sender IN ('USER','ADMIN'));
  END IF;
END $$;

-- Backfill existing rows so ordering works immediately.
UPDATE public.support_tickets
   SET last_message_at = COALESCE(last_message_at, created_at),
       last_sender     = COALESCE(last_sender, 'USER')
 WHERE last_message_at IS NULL;

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('USER','ADMIN')),
  sender_id   uuid,
  body        text NOT NULL DEFAULT '',
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket
  ON public.ticket_messages(ticket_id, created_at);

CREATE INDEX IF NOT EXISTS idx_support_tickets_last_msg
  ON public.support_tickets(last_message_at DESC);

-- Backfill: turn each existing ticket's single message into a thread row.
INSERT INTO public.ticket_messages (ticket_id, sender_type, sender_id, body, created_at)
SELECT st.id, 'USER', st.user_id, st.message, st.created_at
FROM public.support_tickets st
WHERE NOT EXISTS (SELECT 1 FROM public.ticket_messages tm WHERE tm.ticket_id = st.id);

-- ticket_messages: RPC-only — no anon/authenticated grants. service_role keeps full.
REVOKE ALL ON public.ticket_messages FROM anon, authenticated;
```

- [ ] **Step 2: (after applying to a LOCAL/TEST Supabase) verify schema**

Run in the SQL editor of a **non-production** project:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='support_tickets'
  AND column_name IN ('last_message_at','last_sender','user_last_read_at','admin_last_read_at');
-- Expected: 4 rows.
SELECT count(*) FROM ticket_messages; -- Expected: equals count of pre-existing support_tickets.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260614050000_cs_ticket_chat_schema.sql
git commit -m "🎫 db: schema CS ticket chat (support_tickets cols + ticket_messages)"
```

---

### Task A2: Migration — user-side RPCs

**Files:**
- Create: `supabase/migrations/20260614060000_cs_ticket_chat_rpcs.sql`

Depends on: `get_user_id()` (exists), `check_rate_limit(uuid, text, int, int)` (exists, see `place_bet`).

- [ ] **Step 1: Write the RPC migration**

```sql
-- ============================================================================
-- CS ticket chat — user-side RPCs (SECURITY DEFINER, get_user_id-gated).
-- NOT YET APPLIED to production. All GRANT TO anon but never leak other users.
-- ============================================================================

-- create_ticket: header + first USER message. Returns {id} or {error}.
CREATE OR REPLACE FUNCTION public.create_ticket(
  p_subject  text,
  p_category text,
  p_message  text,
  p_image_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v_id uuid; v_subject text; v_msg text;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','NO_SESSION'); END IF;
  PERFORM check_rate_limit(v_uid, 'TICKET_NEW', 5, 600000); -- 5 / 10 min

  v_subject := left(btrim(coalesce(p_subject,'')), 120);
  v_msg     := left(btrim(coalesce(p_message,'')), 2000);
  IF v_subject = '' OR v_msg = '' THEN RETURN jsonb_build_object('error','EMPTY'); END IF;

  INSERT INTO support_tickets (user_id, subject, category, message, status,
                               last_message_at, last_sender, user_last_read_at)
  VALUES (v_uid, v_subject, coalesce(p_category,''), v_msg, 'OPEN',
          NOW(), 'USER', NOW())
  RETURNING id INTO v_id;

  INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, body, image_url)
  VALUES (v_id, 'USER', v_uid, v_msg, p_image_url);

  RETURN jsonb_build_object('id', v_id);
END $$;

-- get_my_tickets: list with last-message preview + unread flag.
CREATE OR REPLACE FUNCTION public.get_my_tickets()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT coalesce(jsonb_agg(t ORDER BY t.last_message_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT st.id, st.subject, st.category, st.status,
           st.last_message_at, st.last_sender,
           left((SELECT tm.body FROM ticket_messages tm
                 WHERE tm.ticket_id = st.id ORDER BY tm.created_at DESC LIMIT 1), 120)
             AS last_message_preview,
           (st.last_sender = 'ADMIN'
             AND st.last_message_at > coalesce(st.user_last_read_at, 'epoch'::timestamptz))
             AS unread
    FROM support_tickets st
    WHERE st.user_id = v_uid
  ) t;
  RETURN v;
END $$;

-- get_ticket_thread: messages of an owned ticket; marks user as read.
CREATE OR REPLACE FUNCTION public.get_ticket_thread(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v_owner uuid; v_ticket jsonb; v_msgs jsonb;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','NO_SESSION'); END IF;
  SELECT user_id INTO v_owner FROM support_tickets WHERE id = p_ticket_id;
  IF v_owner IS NULL OR v_owner <> v_uid THEN RETURN jsonb_build_object('error','NOT_OWNER'); END IF;

  UPDATE support_tickets SET user_last_read_at = NOW() WHERE id = p_ticket_id;

  SELECT to_jsonb(s) INTO v_ticket FROM (
    SELECT id, subject, category, status FROM support_tickets WHERE id = p_ticket_id
  ) s;
  SELECT coalesce(jsonb_agg(m ORDER BY m.created_at ASC), '[]'::jsonb) INTO v_msgs FROM (
    SELECT id, sender_type, body, image_url, created_at
    FROM ticket_messages WHERE ticket_id = p_ticket_id
  ) m;
  RETURN jsonb_build_object('ticket', v_ticket, 'messages', v_msgs);
END $$;

-- send_ticket_message: append USER message to an owned, non-closed ticket.
CREATE OR REPLACE FUNCTION public.send_ticket_message(
  p_ticket_id uuid,
  p_body      text,
  p_image_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v_owner uuid; v_status text; v_id uuid; v_body text;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','NO_SESSION'); END IF;
  SELECT user_id, status INTO v_owner, v_status FROM support_tickets WHERE id = p_ticket_id;
  IF v_owner IS NULL OR v_owner <> v_uid THEN RETURN jsonb_build_object('error','NOT_OWNER'); END IF;
  IF v_status = 'CLOSED' THEN RETURN jsonb_build_object('error','TICKET_CLOSED'); END IF;
  PERFORM check_rate_limit(v_uid, 'TICKET_MSG', 20, 60000); -- 20 / min

  v_body := left(btrim(coalesce(p_body,'')), 2000);
  IF v_body = '' AND p_image_url IS NULL THEN RETURN jsonb_build_object('error','EMPTY'); END IF;

  INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, body, image_url)
  VALUES (p_ticket_id, 'USER', v_uid, v_body, p_image_url)
  RETURNING id INTO v_id;

  UPDATE support_tickets
     SET status = 'OPEN', last_sender = 'USER', last_message_at = NOW(), user_last_read_at = NOW()
   WHERE id = p_ticket_id;

  RETURN jsonb_build_object('id', v_id);
END $$;

-- get_my_ticket_unread_count: for the nav badge.
CREATE OR REPLACE FUNCTION public.get_my_ticket_unread_count()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
DECLARE v_uid uuid; v_n int;
BEGIN
  v_uid := get_user_id();
  IF v_uid IS NULL THEN RETURN jsonb_build_object('count', 0); END IF;
  SELECT count(*) INTO v_n FROM support_tickets
   WHERE user_id = v_uid AND last_sender = 'ADMIN'
     AND last_message_at > coalesce(user_last_read_at, 'epoch'::timestamptz);
  RETURN jsonb_build_object('count', v_n);
END $$;

REVOKE EXECUTE ON FUNCTION public.create_ticket(text,text,text,text)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_tickets()                          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_ticket_thread(uuid)                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_ticket_message(uuid,text,text)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_ticket_unread_count()              FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_ticket(text,text,text,text)        TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_my_tickets()                          TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_ticket_thread(uuid)                   TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.send_ticket_message(uuid,text,text)       TO anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_my_ticket_unread_count()              TO anon, authenticated, service_role;
```

- [ ] **Step 2: Verify `check_rate_limit` signature before relying on it**

Run: `grep -rn "FUNCTION check_rate_limit" supabase/migrations/*.sql`
Expected: a definition `check_rate_limit(p_user_id uuid, p_action ... , p_max ... , p_window_ms ...)`. If the parameter order/types differ, adjust the `PERFORM check_rate_limit(...)` calls above to match exactly.

- [ ] **Step 3: (after applying to LOCAL/TEST) smoke the RPCs**

In a non-production SQL editor, with a known test user's `session_token` set in headers (or call via the REST endpoint with `x-user-token`):
```sql
-- Without a token, must not leak:
SELECT public.get_my_tickets();             -- Expected: []
SELECT public.get_my_ticket_unread_count(); -- Expected: {"count":0}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260614060000_cs_ticket_chat_rpcs.sql
git commit -m "🎫 db: user RPCs create_ticket/get_my_tickets/get_ticket_thread/send_ticket_message/unread_count"
```

---

### Task A3: Migration — trailing anon-INSERT revoke

**Files:**
- Create: `supabase/migrations/20260614070000_revoke_anon_support_insert.sql`

- [ ] **Step 1: Write the trailing revoke**

```sql
-- ============================================================================
-- Trailing revoke — apply ONLY AFTER the new React frontend (which uses the
-- create_ticket RPC) is live. Until then the old SupportPage direct-inserts.
-- NOT YET APPLIED to production.
-- ============================================================================
REVOKE INSERT ON public.support_tickets FROM anon, authenticated;
-- Reads/writes now exclusively via SECURITY DEFINER RPCs + admin-proxy (service_role).
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260614070000_revoke_anon_support_insert.sql
git commit -m "🔒 db: revoke anon INSERT support_tickets (trailing, apply after FE deploy)"
```

---

### Task A4: admin-proxy allowlist — `/ticket_messages`

**Files:**
- Modify: `supabase/functions/admin-proxy/index.ts` (the `ALLOWED_PREFIXES` array, ~line 251)

`/support_tickets` may already be implicitly handled; `/ticket_messages` is new. Verify both are present.

- [ ] **Step 1: Add both prefixes**

In `ALLOWED_PREFIXES`, ensure these entries exist (add any missing, keep alphabetic-ish grouping):
```ts
    '/support_tickets',
    '/ticket_messages',
```

- [ ] **Step 2: Verify**

Run: `grep -n "support_tickets\|ticket_messages" supabase/functions/admin-proxy/index.ts`
Expected: both strings present in the allowlist array.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-proxy/index.ts
git commit -m "🎫 edge: allow /support_tickets + /ticket_messages via admin-proxy"
```

---

## Phase B — React user app

### Task B1: `utils/tickets.js` — RPC wrapper

**Files:**
- Create: `NUMBER9/src/utils/tickets.js`

- [ ] **Step 1: Write the helper**

```javascript
import { supabase } from './supabase';
import { apiInvoke } from './api';

const _warn = (m, e) => { if (import.meta.env.DEV) console.warn('[tickets]', m, e); };

/** List the current user's tickets (newest activity first). */
export async function listMyTickets() {
  try {
    const { data, error } = await supabase.rpc('get_my_tickets');
    if (error) { _warn('listMyTickets', error); return []; }
    return Array.isArray(data) ? data : [];
  } catch (e) { _warn('listMyTickets', e); return []; }
}

/** Full thread for an owned ticket. Returns {ticket, messages} or {error}. */
export async function getTicketThread(ticketId) {
  try {
    const { data, error } = await supabase.rpc('get_ticket_thread', { p_ticket_id: ticketId });
    if (error) return { error: error.message || 'LOAD_FAILED' };
    return data || { error: 'LOAD_FAILED' };
  } catch (e) { _warn('getTicketThread', e); return { error: 'NETWORK' }; }
}

/** Create a ticket. Returns {id} or {error}. */
export async function createTicket({ subject, category, message, imageUrl = null }) {
  try {
    const { data, error } = await supabase.rpc('create_ticket', {
      p_subject: subject, p_category: category, p_message: message, p_image_url: imageUrl,
    });
    if (error) return { error: error.message || 'CREATE_FAILED' };
    return data || { error: 'CREATE_FAILED' };
  } catch (e) { _warn('createTicket', e); return { error: 'NETWORK' }; }
}

/** Append a message to an owned ticket. Returns {id} or {error}. */
export async function sendTicketMessage(ticketId, body, imageUrl = null) {
  try {
    const { data, error } = await supabase.rpc('send_ticket_message', {
      p_ticket_id: ticketId, p_body: body, p_image_url: imageUrl,
    });
    if (error) return { error: error.message || 'SEND_FAILED' };
    return data || { error: 'SEND_FAILED' };
  } catch (e) { _warn('sendTicketMessage', e); return { error: 'NETWORK' }; }
}

/** Unread admin-reply count for the nav badge. */
export async function getTicketUnreadCount() {
  try {
    const { data, error } = await supabase.rpc('get_my_ticket_unread_count');
    if (error) return 0;
    return Number(data?.count ?? 0);
  } catch { return 0; }
}

/** Upload one image (base64 data URL) → public URL via existing edge fn. */
export async function uploadTicketImage(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  try {
    const data = await apiInvoke('upload-proof', { dataUrl, kind: 'ticket' });
    return data?.url || null;
  } catch (e) { _warn('uploadTicketImage', e); return null; }
}
```

- [ ] **Step 2: Lint**

Run: `cd NUMBER9 && npx eslint src/utils/tickets.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add NUMBER9/src/utils/tickets.js
git commit -m "🎫 react: tickets.js RPC wrapper (list/thread/create/send/unread/upload)"
```

---

### Task B2: i18n keys (en + id)

**Files:**
- Modify: `NUMBER9/src/i18n/en.js` (the `support:` block)
- Modify: `NUMBER9/src/i18n/id.js` (the `support:` block)

- [ ] **Step 1: Add keys to `en.js` inside the `support: { ... }` object**

```javascript
    // ── in-app ticket chat ──
    tickets_title: 'My Tickets',
    new_ticket: 'New Ticket',
    no_tickets: 'No tickets yet',
    ticket_subject: 'Subject',
    ticket_category: 'Category',
    ticket_message: 'Message',
    ticket_attach: 'Attach image',
    ticket_send: 'Send',
    ticket_reply_ph: 'Type your message…',
    ticket_closed_note: 'This ticket is closed. Please open a new ticket to continue.',
    ticket_create: 'Create Ticket',
    ticket_status_open: 'OPEN',
    ticket_status_replied: 'REPLIED',
    ticket_status_closed: 'CLOSED',
    ticket_create_failed: 'Could not create ticket. Please try again.',
    ticket_send_failed: 'Could not send message.',
    ticket_rate_limit: 'Too many messages — slow down a moment.',
    ticket_too_long: 'Message is too long.',
    ticket_unread: 'New reply',
    live_chat_inapp: 'Live Chat',
```

- [ ] **Step 2: Add the same keys to `id.js` inside `support: { ... }` (Indonesian)**

```javascript
    // ── in-app ticket chat ──
    tickets_title: 'Tiket Saya',
    new_ticket: 'Tiket Baru',
    no_tickets: 'Belum ada tiket',
    ticket_subject: 'Subjek',
    ticket_category: 'Kategori',
    ticket_message: 'Pesan',
    ticket_attach: 'Lampirkan gambar',
    ticket_send: 'Kirim',
    ticket_reply_ph: 'Tulis pesan…',
    ticket_closed_note: 'Tiket ini sudah ditutup. Silakan buat tiket baru untuk melanjutkan.',
    ticket_create: 'Buat Tiket',
    ticket_status_open: 'TERBUKA',
    ticket_status_replied: 'DIBALAS',
    ticket_status_closed: 'DITUTUP',
    ticket_create_failed: 'Gagal membuat tiket. Coba lagi.',
    ticket_send_failed: 'Gagal mengirim pesan.',
    ticket_rate_limit: 'Terlalu banyak pesan — tunggu sebentar.',
    ticket_too_long: 'Pesan terlalu panjang.',
    ticket_unread: 'Balasan baru',
    live_chat_inapp: 'Live Chat',
```

- [ ] **Step 3: Build to verify no JS syntax error**

Run: `cd NUMBER9 && npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 4: Commit**

```bash
git add NUMBER9/src/i18n/en.js NUMBER9/src/i18n/id.js
git commit -m "🎫 react: i18n keys for ticket chat (en+id)"
```

---

### Task B3: Rework `SupportPage.jsx` — ticket list + thread + new-ticket

**Files:**
- Modify: `NUMBER9/src/pages/SupportPage.jsx`

The page keeps its FAQ + CS-channel sections (Telegram/WhatsApp via `cs`). The old one-shot ticket FORM is replaced by the My-Tickets list / thread / new-ticket modal. Reuse `ModalOverlay`, `Toast`, `wibDateTime`, existing `CATEGORIES`.

- [ ] **Step 1: Replace the ticket-form state + submit with ticket-chat logic**

At the top of the component, remove the old `ticketSubject/ticketCategory/ticketMessage/ticketStatus` form state and its `submit()` handler (the `.from('support_tickets').insert()` block). Add:

```javascript
import {
  listMyTickets, getTicketThread, createTicket, sendTicketMessage, uploadTicketImage,
} from '../utils/tickets';
import ModalOverlay from '../components/ui/ModalOverlay';
import { wibDateTime } from '../utils/wib';
```

```javascript
  // ── ticket chat state ──
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [openId, setOpenId] = useState(null);          // open thread ticket id
  const [thread, setThread] = useState(null);          // {ticket, messages}
  const [reply, setReply] = useState('');
  const [replyImg, setReplyImg] = useState('');        // base64 preview
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [nt, setNt] = useState({ subject: '', category: 'OTHER', message: '', img: '' });
  const [toast, setToast] = useState(null);

  // initial + 15s list refresh
  useEffect(() => {
    if (!auth?.id) return;
    let alive = true;
    const load = () => listMyTickets().then((r) => { if (alive) { setTickets(r); setTicketsLoading(false); } });
    load();
    const i = setInterval(load, 15000);
    return () => { alive = false; clearInterval(i); };
  }, [auth?.id]);

  // open thread + 3.5s poll while open
  useEffect(() => {
    if (!openId) { setThread(null); return; }
    let alive = true;
    const load = () => getTicketThread(openId).then((r) => {
      if (!alive) return;
      if (r?.error) { setToast({ type: 'err', text: r.error }); setOpenId(null); return; }
      setThread(r);
    });
    load();
    const i = setInterval(load, 3500);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { alive = false; clearInterval(i); window.removeEventListener('focus', onFocus); };
  }, [openId]);

  const onPickImg = (e, setter) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => setter(ev.target.result);
    r.onerror = () => setToast({ type: 'err', text: t('common.file_read_error') });
    r.readAsDataURL(f);
  };

  const doCreate = async () => {
    if (!nt.subject.trim() || !nt.message.trim()) return;
    setSending(true);
    let imageUrl = null;
    if (nt.img) imageUrl = await uploadTicketImage(nt.img);
    const r = await createTicket({ subject: nt.subject, category: nt.category, message: nt.message, imageUrl });
    setSending(false);
    if (r?.error) return setToast({ type: 'err', text: t('support.ticket_create_failed') });
    setShowNew(false);
    setNt({ subject: '', category: 'OTHER', message: '', img: '' });
    const fresh = await listMyTickets(); setTickets(fresh);
    setOpenId(r.id);
  };

  const doSend = async () => {
    if (!openId || (!reply.trim() && !replyImg)) return;
    setSending(true);
    let imageUrl = null;
    if (replyImg) imageUrl = await uploadTicketImage(replyImg);
    const r = await sendTicketMessage(openId, reply, imageUrl);
    setSending(false);
    if (r?.error) {
      const msg = r.error.includes('TICKET_CLOSED') ? t('support.ticket_closed_note')
        : r.error.includes('RATE_LIMIT') ? t('support.ticket_rate_limit')
        : r.error.includes('TOO_LONG') ? t('support.ticket_too_long')
        : t('support.ticket_send_failed');
      return setToast({ type: 'err', text: msg });
    }
    setReply(''); setReplyImg('');
    getTicketThread(openId).then((x) => { if (!x?.error) setThread(x); });
  };
```

- [ ] **Step 2: Replace the old ticket-form JSX section with the My-Tickets list**

Where the old `support_tickets` form `<section>` was, insert:

```jsx
      {/* ── My Tickets ── */}
      <section className="rounded-xl border border-[#1f2128] bg-[#0c0e14]">
        <div className="flex items-center justify-between border-b border-[#1f2128] px-3 py-2 lg:px-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-yellow-400">{t('support.tickets_title')}</p>
          <button onClick={() => setShowNew(true)}
            className="rounded bg-yellow-400 px-3 py-1.5 text-[11px] font-extrabold text-black hover:bg-yellow-300">
            {t('support.new_ticket')}
          </button>
        </div>
        <div className="divide-y divide-[#1f2128]">
          {ticketsLoading && <div className="px-4 py-6 text-center text-xs text-zinc-500">…</div>}
          {!ticketsLoading && tickets.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-zinc-500">{t('support.no_tickets')}</div>
          )}
          {tickets.map((tk) => (
            <button key={tk.id} onClick={() => setOpenId(tk.id)}
              className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.02] lg:px-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[12px] font-bold text-white">{tk.subject}</p>
                  {tk.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400" title={t('support.ticket_unread')} />}
                </div>
                <p className="truncate text-[10px] text-zinc-500">{tk.last_message_preview || ''}</p>
              </div>
              <span className={`shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                tk.status === 'CLOSED' ? 'bg-zinc-700/40 text-zinc-400'
                : tk.status === 'REPLIED' ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-yellow-400/15 text-yellow-400'}`}>
                {t('support.ticket_status_' + (tk.status || 'open').toLowerCase())}
              </span>
            </button>
          ))}
        </div>
      </section>
```

- [ ] **Step 3: Add the Thread modal + New-Ticket modal JSX (before the closing `</PageShell>`/wrapper)**

```jsx
      {/* ── Thread modal ── */}
      {openId && thread && (
        <ModalOverlay open={!!openId} onClose={() => setOpenId(null)} className="items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <div className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0e1017]">
            <div className="flex items-center justify-between border-b border-[#1f2128] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-extrabold text-white">{thread.ticket?.subject}</p>
                <p className="text-[10px] text-zinc-500">{thread.ticket?.category} · {t('support.ticket_status_' + (thread.ticket?.status || 'open').toLowerCase())}</p>
              </div>
              <button onClick={() => setOpenId(null)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#1f2128] text-zinc-500 hover:text-white">✕</button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {(thread.messages || []).map((m) => (
                <div key={m.id} className={`flex ${m.sender_type === 'USER' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.sender_type === 'USER' ? 'bg-yellow-400 text-black' : 'bg-[#1f2128] text-zinc-100'}`}>
                    {m.image_url && <img src={m.image_url} alt="" className="mb-1 max-h-40 rounded-lg" />}
                    {m.body && <p className="text-[12px] whitespace-pre-wrap break-words">{m.body}</p>}
                    <p className={`mt-0.5 text-[8px] ${m.sender_type === 'USER' ? 'text-black/50' : 'text-zinc-500'}`}>{wibDateTime(m.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
            {thread.ticket?.status === 'CLOSED' ? (
              <div className="border-t border-[#1f2128] px-4 py-3 text-center text-[11px] text-zinc-500">{t('support.ticket_closed_note')}</div>
            ) : (
              <div className="border-t border-[#1f2128] p-3">
                {replyImg && <img src={replyImg} alt="" className="mb-2 max-h-24 rounded-lg" />}
                <div className="flex items-end gap-2">
                  <label className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-[#1f2128] text-zinc-400 hover:text-white" title={t('support.ticket_attach')}>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImg(e, setReplyImg)} />📎
                  </label>
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={1}
                    placeholder={t('support.ticket_reply_ph')}
                    className="max-h-24 flex-1 resize-none rounded-lg border border-[#1f2128] bg-[#0e1117] px-3 py-2 text-[12px] text-white outline-none focus:border-yellow-400/50" />
                  <button onClick={doSend} disabled={sending || (!reply.trim() && !replyImg)}
                    className="h-9 shrink-0 rounded-lg bg-yellow-400 px-4 text-[12px] font-extrabold text-black hover:bg-yellow-300 disabled:opacity-40">
                    {t('support.ticket_send')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </ModalOverlay>
      )}

      {/* ── New Ticket modal ── */}
      {showNew && (
        <ModalOverlay open={showNew} onClose={() => setShowNew(false)} className="items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.06] bg-[#0e1017] p-5">
            <p className="mb-4 text-[14px] font-extrabold text-white">{t('support.ticket_create')}</p>
            <div className="space-y-3">
              <input value={nt.subject} onChange={(e) => setNt((p) => ({ ...p, subject: e.target.value }))}
                placeholder={t('support.ticket_subject')} className={inp} />
              <select value={nt.category} onChange={(e) => setNt((p) => ({ ...p, category: e.target.value }))} className={inp}>
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{t(c.i18n)}</option>)}
              </select>
              <textarea value={nt.message} onChange={(e) => setNt((p) => ({ ...p, message: e.target.value }))} rows={4}
                placeholder={t('support.ticket_message')} className={inp + ' resize-none'} />
              {nt.img && <img src={nt.img} alt="" className="max-h-28 rounded-lg" />}
              <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400 hover:text-white">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickImg(e, (v) => setNt((p) => ({ ...p, img: v }))) } />
                📎 {t('support.ticket_attach')}
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowNew(false)} className="h-10 flex-1 rounded-lg border border-[#1f2128] text-[12px] font-bold text-zinc-300 hover:text-white">{t('common.cancel')}</button>
                <button onClick={doCreate} disabled={sending || !nt.subject.trim() || !nt.message.trim()}
                  className="h-10 flex-1 rounded-lg bg-yellow-400 text-[12px] font-extrabold text-black hover:bg-yellow-300 disabled:opacity-40">{t('support.ticket_create')}</button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
```

(`Toast` is already imported in SupportPage; if not, add `import Toast from '../components/ui/Toast'`.)

- [ ] **Step 4: Build + lint**

Run: `cd NUMBER9 && npm run build && npx eslint src/pages/SupportPage.jsx`
Expected: build `✓ built`; eslint no errors. (Pre-existing warnings elsewhere are fine.)

- [ ] **Step 5: Commit**

```bash
git add NUMBER9/src/pages/SupportPage.jsx
git commit -m "🎫 react: SupportPage in-app ticket chat (list/thread/new-ticket, polling)"
```

---

### Task B4: CsWidget — add in-app "Live Chat" option + always render for logged-in users

**Files:**
- Modify: `NUMBER9/src/components/ui/CsWidget.jsx`

Note: there is **no `support` entry in `NAV_FULL`** (nav keys are dashboard/king/wallet/history/trading/network/profile), and `SupportPage` is reached via direct route `/c/:clientUuid/support`. So the in-app chat entry point lives on the CsWidget launcher, and the unread indicator goes there too (Task B5) rather than on a nav item.

- [ ] **Step 1: Import router hooks**

At the top of the file add:
```javascript
import { useNavigate, useParams } from 'react-router-dom'
```
Inside the component body (after `const auth = ...`):
```javascript
  const navigate = useNavigate()
  const { clientUuid } = useParams()
```

- [ ] **Step 2: Change the render guard so the widget shows for any logged-in user**

Locate the guard lines:
```javascript
  // Backend already gates by token; this is defense-in-depth on the frontend.
  if (!auth?.id) return null
  if (!cs?.anyActive) return null
```
Replace with (drop the `anyActive` early-return — the Live Chat button must always be available to logged-in users; WA/TG buttons stay conditional via `cs?.tgOk`/`cs?.waOk`):
```javascript
  // Login-only widget; Live Chat is always available, WA/TG are conditional.
  if (!auth?.id) return null
```

- [ ] **Step 3: Add the Live Chat button as the first channel**

In the widget body (the `<div className="p-4 space-y-2.5">` block), add **before** the Telegram/WhatsApp buttons:
```jsx
              <button
                onClick={() => { setOpen(false); navigate(`/c/${clientUuid || auth.id}/support`) }}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-bold py-3 transition-colors active:scale-[0.98]"
              >
                💬 Live Chat
              </button>
```

- [ ] **Step 4: Build + lint**

Run: `cd NUMBER9 && npm run build && npx eslint src/components/ui/CsWidget.jsx`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add NUMBER9/src/components/ui/CsWidget.jsx
git commit -m "🎫 react: CsWidget in-app Live Chat option + always render for logged-in"
```

---

### Task B5: CsWidget — unread dot on the floating launcher

**Files:**
- Modify: `NUMBER9/src/components/ui/CsWidget.jsx`

The launcher is always visible for logged-in users, so the unread indicator lives there (no nav `support` item exists to badge).

- [ ] **Step 1: Poll unread count + render a dot on the launcher**

Add import:
```javascript
import { getTicketUnreadCount } from '../../utils/tickets'
```
Add state + poll inside the component:
```javascript
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!auth?.id) return
    let alive = true
    const tick = () => getTicketUnreadCount().then((n) => { if (alive) setUnread(n) })
    tick()
    const i = setInterval(tick, 15000)
    return () => { alive = false; clearInterval(i) }
  }, [auth?.id])
```
On the floating launcher `<button>`, add `className="… relative …"` (it already has `relative`-free positioning via `fixed`; add a `relative`-positioned dot using absolute inside). Insert this as the first child of the launcher button, before the `<svg>`:
```jsx
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
```
(The launcher button is `fixed`; `fixed` elements establish a containing block, so the `absolute` dot positions against the button. No other change needed.)

- [ ] **Step 2: Build + lint**

Run: `cd NUMBER9 && npm run build && npx eslint src/components/ui/CsWidget.jsx`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add NUMBER9/src/components/ui/CsWidget.jsx
git commit -m "🎫 react: unread dot on CsWidget launcher for new admin replies"
```

---

## Phase C — Angular admin app

### Task C1: `admin.service.ts` — ticket methods

**Files:**
- Modify: `src/app/core/services/admin.service.ts` (add near the platform-config methods)

- [ ] **Step 1: Add methods (use existing `proxy`/`get` helpers)**

```typescript
  // ── SUPPORT TICKETS ──
  getTickets(query = 'order=last_message_at.desc.nullslast&limit=100') {
    return this.proxy<any[]>('GET', `/support_tickets?${query}`);
  }
  getTicketMessages(ticketId: string) {
    return this.proxy<any[]>('GET', `/ticket_messages?ticket_id=eq.${ticketId}&order=created_at.asc`);
  }
  async replyTicket(ticketId: string, body: string, imageUrl: string | null, adminId: string) {
    await this.proxy('POST', '/ticket_messages', {
      ticket_id: ticketId, sender_type: 'ADMIN', sender_id: adminId,
      body: body || '', image_url: imageUrl,
    });
    await this.proxy('PATCH', `/support_tickets?id=eq.${ticketId}`, {
      status: 'REPLIED', last_sender: 'ADMIN',
      last_message_at: new Date().toISOString(), admin_last_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  setTicketStatus(ticketId: string, status: 'OPEN' | 'REPLIED' | 'CLOSED') {
    return this.proxy('PATCH', `/support_tickets?id=eq.${ticketId}`, {
      status, updated_at: new Date().toISOString(),
    });
  }
  async getOpenTicketCount(): Promise<number> {
    const rows = await this.proxy<any[]>('GET', '/support_tickets?status=neq.CLOSED&select=id');
    return Array.isArray(rows) ? rows.length : 0;
  }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: bundle generation complete, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/admin.service.ts
git commit -m "🎫 admin: ticket service methods (list/messages/reply/status/open-count)"
```

---

### Task C2: New admin page `tickets.component.ts`

**Files:**
- Create: `src/app/modules/dashboard/pages/tickets/tickets.component.ts`

- [ ] **Step 1: Write the component (inline template, OnPush, PrimeNG, follows cs-contact/wallet-admin patterns)**

> **v1 scope note:** admin replies are **text-only** in v1 (the `replyTicket` signature already accepts `imageUrl` for a later iteration; the admin compose box has no image picker yet). Users can attach images; admin image-reply is a deliberate trim.

```typescript
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { WibDatePipe } from 'src/shared/pipes/wib-date.pipe';

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, DialogModule, PageHeaderComponent, LoadingErrorComponent, WibDatePipe],
  template: `
    <div data-page="tickets" class="space-y-6">
      <app-page-header icon="chat" title="Support Tickets" subtitle="Balas pertanyaan customer service" />
      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        <div class="bg-card border-border rounded-lg page-accent-card overflow-hidden">
          <div class="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <p-select [(ngModel)]="statusFilter" (onChange)="applyFilter()"
              [options]="STATUS_OPTS" optionLabel="label" optionValue="value" styleClass="!text-sm !w-44" />
            <input [(ngModel)]="search" (ngModelChange)="applyFilter()" placeholder="Cari subjek/kategori…"
              class="bg-muted border-border text-foreground rounded-lg border px-3 py-2 text-sm outline-none" />
          </div>
          <table class="saas-table w-full text-left text-xs">
            <thead>
              <tr class="border-b border-border text-muted-foreground uppercase tracking-wider">
                <th class="px-3 py-2.5">Subjek</th><th class="px-3 py-2.5">Kategori</th>
                <th class="px-3 py-2.5">Status</th><th class="px-3 py-2.5">Update</th><th class="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              @for (tk of filtered; track tk.id) {
                <tr class="border-b border-border/40 hover:bg-muted/25"
                    [class.font-semibold]="tk.last_sender === 'USER' && tk.status !== 'CLOSED'">
                  <td class="px-3 py-2 text-foreground">
                    @if (tk.last_sender === 'USER' && tk.status !== 'CLOSED') {
                      <span class="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500"></span>
                    }
                    {{ tk.subject }}
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">{{ tk.category || '-' }}</td>
                  <td class="px-3 py-2"><span class="n9-badge" [ngClass]="badgeClass(tk.status)">{{ tk.status }}</span></td>
                  <td class="px-3 py-2 text-muted-foreground">{{ tk.last_message_at | wibDate: 'short' }}</td>
                  <td class="px-3 py-2 text-right">
                    <button (click)="open(tk)" class="n9-btn n9-btn-outline">Buka</button>
                  </td>
                </tr>
              }
              @if (filtered.length === 0) {
                <tr><td colspan="5" class="px-3 py-8 text-center text-muted-foreground">Tidak ada tiket</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '560px', maxWidth: '95vw' }"
        [contentStyle]="{ 'max-height': '70vh', overflow: 'auto' }" styleClass="dashboard-dialog"
        [draggable]="false" [resizable]="false" (onHide)="active = null; detailVisible = false">
        <ng-template pTemplate="header"><span class="text-sm font-bold text-foreground">{{ active?.subject }}</span></ng-template>
        <ng-template pTemplate="content">
          @if (active) {
            <div class="space-y-2">
              @for (m of messages; track m.id) {
                <div class="flex" [class.justify-end]="m.sender_type === 'ADMIN'">
                  <div class="max-w-[80%] rounded-xl px-3 py-2 text-xs"
                       [ngClass]="m.sender_type === 'ADMIN' ? 'bg-primary/15 text-foreground' : 'bg-muted text-foreground'">
                    @if (m.image_url) { <img [src]="m.image_url" class="mb-1 max-h-40 rounded-lg" /> }
                    @if (m.body) { <p class="whitespace-pre-wrap break-words">{{ m.body }}</p> }
                    <p class="mt-0.5 text-[9px] text-muted-foreground">{{ m.created_at | wibDate: 'short' }}</p>
                  </div>
                </div>
              }
            </div>
          }
        </ng-template>
        <ng-template pTemplate="footer">
          @if (active && active.status !== 'CLOSED') {
            <div class="flex w-full flex-col gap-2">
              <textarea [(ngModel)]="replyBody" rows="2" placeholder="Tulis balasan…"
                class="bg-muted border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none"></textarea>
              <div class="flex justify-between gap-2">
                <button (click)="closeTicket()" class="n9-btn n9-btn-danger">Tutup Tiket</button>
                <button (click)="sendReply()" [disabled]="sending || !replyBody.trim()" class="n9-btn n9-btn-primary">
                  {{ sending ? 'Mengirim…' : 'Kirim Balasan' }}
                </button>
              </div>
            </div>
          } @else if (active) {
            <button (click)="reopen()" class="n9-btn n9-btn-warn">Buka Kembali</button>
          }
        </ng-template>
      </p-dialog>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private notification = inject(NotificationService);
  private poll?: ReturnType<typeof setInterval>;

  readonly STATUS_OPTS = [
    { label: 'Semua', value: 'ALL' }, { label: 'Open', value: 'OPEN' },
    { label: 'Replied', value: 'REPLIED' }, { label: 'Closed', value: 'CLOSED' },
  ];
  tickets: any[] = [];
  filtered: any[] = [];
  statusFilter = 'ALL';
  search = '';
  loading = true;
  error: string | null = null;

  detailVisible = false;
  active: any = null;
  messages: any[] = [];
  replyBody = '';
  sending = false;

  ngOnInit() {
    this.load();
    // near-live: refresh the list every 15s (silent — no spinner after first load)
    this.poll = setInterval(() => this.load(true), 15000);
  }
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); }

  async load(silent = false) {
    if (!silent) this.loading = true;
    this.error = null;
    try {
      this.tickets = (await this.admin.getTickets()) || [];
      this.applyFilter();
    } catch (e: unknown) {
      if (!silent) this.error = e instanceof Error ? e.message : 'Gagal memuat tiket.';
    }
    this.loading = false; this.cdr.markForCheck();
  }

  applyFilter() {
    const q = this.search.trim().toLowerCase();
    this.filtered = this.tickets.filter((t) =>
      (this.statusFilter === 'ALL' || t.status === this.statusFilter) &&
      (!q || `${t.subject} ${t.category}`.toLowerCase().includes(q)));
    this.cdr.markForCheck();
  }

  badgeClass(s: string) {
    return s === 'CLOSED' ? 'n9-badge-neutral' : s === 'REPLIED' ? 'n9-badge-success' : 'n9-badge-warn';
  }

  async open(tk: any) {
    this.active = tk; this.detailVisible = true; this.messages = []; this.replyBody = '';
    this.cdr.markForCheck();
    this.messages = (await this.admin.getTicketMessages(tk.id)) || [];
    this.cdr.markForCheck();
  }

  async sendReply() {
    if (!this.active || !this.replyBody.trim()) return;
    this.sending = true;
    try {
      const me = this.auth.getCurrentUser();
      await this.admin.replyTicket(this.active.id, this.replyBody.trim(), null, me?.id || '');
      this.replyBody = '';
      this.active.status = 'REPLIED';
      this.messages = (await this.admin.getTicketMessages(this.active.id)) || [];
      await this.load();
      this.notification.success('Terkirim', 'Balasan dikirim.');
    } catch (e: unknown) {
      this.notification.error('Gagal', e instanceof Error ? e.message : 'Tidak bisa kirim balasan.');
    }
    this.sending = false; this.cdr.markForCheck();
  }

  async closeTicket() {
    if (!this.active) return;
    await this.admin.setTicketStatus(this.active.id, 'CLOSED');
    this.active.status = 'CLOSED'; await this.load(); this.cdr.markForCheck();
  }
  async reopen() {
    if (!this.active) return;
    await this.admin.setTicketStatus(this.active.id, 'OPEN');
    this.active.status = 'OPEN'; await this.load(); this.cdr.markForCheck();
  }
}
```

- [ ] **Step 2: Verify the `WibDatePipe` import path**

Run: `grep -rn "class WibDatePipe" src/shared/pipes/wib-date.pipe.ts`
Expected: found at that path. If the path differs, fix the import. Also confirm PrimeNG `SelectModule`/`DialogModule` import names match those used in `wallet-admin.component.ts` (`grep -n "primeng/select\|primeng/dialog" src/app/modules/dashboard/pages/wallet-admin/wallet-admin.component.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/app/modules/dashboard/pages/tickets/tickets.component.ts
git commit -m "🎫 admin: tickets inbox page (list/thread/reply/close/reopen)"
```

---

### Task C3: Route + menu + PAGE_ORDER + sidebar badge

**Files:**
- Modify: `src/app/modules/dashboard/dashboard-routing.module.ts`
- Modify: `src/app/core/constants/menu.ts`
- Modify: `src/app/modules/dashboard/dashboard.component.ts` (`PAGE_ORDER`)
- Modify: `src/app/modules/dashboard/pages/layout?` → sidebar: `src/app/modules/layout/components/sidebar/sidebar.component.ts`

- [ ] **Step 1: Add the route (this router uses top-import + `component:`, like `cs-contact`)**

At the top of `dashboard-routing.module.ts`, add the import next to the other page imports:
```typescript
import { TicketsComponent } from 'src/app/modules/dashboard/pages/tickets/tickets.component';
```
Then add a child route inside the `children` array (near `/kyc`, `/referrals`):
```typescript
      { path: 'tickets', component: TicketsComponent },
```

- [ ] **Step 2: Add the menu item (Members group)**

In `menu.ts`, inside the `Members` group `items` array:
```typescript
        { icon: 'assets/icons/heroicons/outline/chat.svg', label: 'Support Tickets', route: '/tickets' },
```
Verify a chat icon exists: `ls src/assets/icons/heroicons/outline/ | grep -i chat`. If not present, reuse an existing one (e.g. `bell.svg` or `identification.svg`).

- [ ] **Step 3: Add `/tickets` to `PAGE_ORDER`**

In `dashboard.component.ts`, add `'/tickets'` to the `PAGE_ORDER` array near the other Members routes (`/kyc`, `/referrals`). Run `grep -n "PAGE_ORDER" src/app/modules/dashboard/dashboard.component.ts` to locate.

- [ ] **Step 4: Sidebar open-ticket badge**

In `sidebar.component.ts` `refreshBadges()`, add to the `Promise.all` array:
```typescript
        this.admin.getOpenTicketCount().catch(() => 0),
```
and destructure it, then include in `updateBadges`:
```typescript
      this.menuService.updateBadges({
        '/kyc': pendingKyc,
        '/bets': pendingBets,
        '/deposits': pendingDeposits,
        '/withdrawals': pendingWithdrawals,
        '/tickets': openTickets,
      });
```
(Add `openTickets` to the destructured tuple in the same order you appended it.)

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: bundle generation complete, no errors. Confirm the new route lazy-chunk appears.

- [ ] **Step 6: Commit**

```bash
git add src/app/modules/dashboard/dashboard-routing.module.ts src/app/core/constants/menu.ts src/app/modules/dashboard/dashboard.component.ts src/app/modules/layout/components/sidebar/sidebar.component.ts
git commit -m "🎫 admin: wire tickets route + menu + PAGE_ORDER + sidebar open-count badge"
```

---

## Phase D — WhatsApp / Telegram correctness pass

### Task D1: Telegram URL validation on admin save

**Files:**
- Modify: `src/app/modules/dashboard/pages/cs-contact/cs-contact.component.ts`

- [ ] **Step 1: Validate the Telegram link before save**

In `save()`, before building `entries`, add:
```typescript
      const tg = (this.form.telegram_link || '').trim();
      if (this.form.telegram_active && tg && !/^https:\/\/(t\.me|telegram\.me)\/.+/i.test(tg)) {
        this.notification.error('Link Telegram tidak valid', 'Gunakan format https://t.me/username');
        this.saving = false; this.cdr.markForCheck();
        return;
      }
      this.form.telegram_link = tg;
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/modules/dashboard/pages/cs-contact/cs-contact.component.ts
git commit -m "🎫 admin: validate Telegram URL format on CS save"
```

---

### Task D2: WhatsApp number normalization safety (client)

**Files:**
- Modify: `NUMBER9/src/utils/csContact.js` (the `normalize` function — confirm it already strips non-digits)

- [ ] **Step 1: Confirm/strengthen number normalization**

In `normalize()`, ensure the WA number is digits-only and the link is only built when non-empty:
```javascript
  const waNumber = (cfg.cs_wa_number || '').replace(/[^\d]/g, '');
  const waOkFinal = waOk && waNumber.length >= 8; // guard against malformed/short numbers
  const waHref = waOkFinal ? `https://wa.me/${waNumber}?text=${encodeURIComponent(welcome)}` : null;
```
Then use `waOkFinal` in place of `waOk` in the returned object's `waOk`/`anyActive`.

- [ ] **Step 2: Build + lint**

Run: `cd NUMBER9 && npm run build && npx eslint src/utils/csContact.js`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add NUMBER9/src/utils/csContact.js
git commit -m "🎫 react: harden WhatsApp number normalization in csContact"
```

---

## Final verification (after all tasks)

- [ ] **Both apps build clean:** `npm run build` (Angular, repo root) and `cd NUMBER9 && npm run build`.
- [ ] **Lint clean on touched files:** `cd NUMBER9 && npx eslint src/utils/tickets.js src/pages/SupportPage.jsx src/components/ui/CsWidget.jsx src/components/Layout.jsx src/utils/csContact.js`.
- [ ] **Migrations present, not applied to live:** `ls supabase/migrations/2026061405* 2026061406* 2026061407*` → three files. Confirm none applied to project `dqsmpdetiqsqfnidekik`.
- [ ] **Runtime smoke (deferred to after apply on a test project + deploy):** create ticket → appears in admin inbox → admin reply → appears in user thread within ~3.5s → unread badge increments then clears → close → user reply blocked → admin reopen. Mobile + desktop.

## Deploy ordering (operational note for whoever applies)

1. Apply additive migrations `…050000` (schema) + `…060000` (RPCs); add `/ticket_messages` to admin-proxy and redeploy `admin-proxy`. (Safe — additive.)
2. Deploy Angular admin (tickets page) and React user app (SupportPage rework — now uses `create_ticket` RPC).
3. **Only then** apply `…070000` (revoke anon INSERT on `support_tickets`).
