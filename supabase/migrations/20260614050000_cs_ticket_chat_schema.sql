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
