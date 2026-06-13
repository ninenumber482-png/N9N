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
