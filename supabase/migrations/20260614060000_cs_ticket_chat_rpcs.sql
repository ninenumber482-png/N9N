-- ============================================================================
-- CS ticket chat — user-side RPCs (SECURITY DEFINER, get_user_id-gated).
-- NOT YET APPLIED to production. All GRANT TO anon but never leak other users.
-- check_rate_limit signature confirmed: check_rate_limit(UUID, TEXT, INT, INT).
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
