CREATE TABLE IF NOT EXISTS support_tickets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REPLIED','CLOSED')),
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Users can view their own tickets
CREATE POLICY "support_tickets_select_own"
  ON support_tickets FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own tickets
CREATE POLICY "support_tickets_insert_own"
  ON support_tickets FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admins via proxy can read/write all
CREATE POLICY "support_tickets_select_admin"
  ON support_tickets FOR SELECT
  USING (true);

CREATE POLICY "support_tickets_update_admin"
  ON support_tickets FOR UPDATE
  USING (true);
