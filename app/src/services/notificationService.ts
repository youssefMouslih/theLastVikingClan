import { supabase } from '../lib/supabase';

// Notification types (§67). V1 = in-app only (§68); push/email later.
export type NotificationType =
  | 'MATCH_ASSIGNED'
  | 'MATCH_DEADLINE_WARNING'
  | 'MATCH_OVERDUE'
  | 'RESULT_SUBMITTED'
  | 'RESULT_CONFIRMED'
  | 'RESULT_DISPUTED'
  | 'DISPUTE_RESOLVED'
  | 'COMPETITION_INVITATION'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSING'
  | 'COMPETITION_STARTED'
  | 'COMPETITION_FINISHED'
  | 'PLAYER_REPLACED'
  | 'ANNOUNCEMENT'
  | 'WAITLIST_AVAILABLE';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as NotificationRow[];
}

export async function markRead(id: string) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markAllRead(userId: string) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
  if (error) throw new Error(error.message);
}

// Fire-and-forget: never break the core flow if notification RLS blocks.
// Requires migration 0002 (notifications INSERT policy).
// After storing, nudges the send-push Edge Function (if deployed) so the
// raven also lands on the device. Missing function = warn only.
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  entity?: { type: string; id: string },
): Promise<void> {
  try {
    const { data, error } = await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      entity_type: entity?.type ?? null,
      entity_id: entity?.id ?? null,
    }).select('id').single();
    if (error) {
      console.warn('notify skipped:', error.message);
      return;
    }
    const nid = (data as { id: string } | null)?.id;
    if (!nid) return;
    try {
      await supabase.functions.invoke('send-push', { body: { notification_id: nid } });
    } catch (e) {
      console.warn('push skipped (function not deployed?):', e instanceof Error ? e.message : e);
    }
  } catch (e) {
    console.warn('notify skipped:', e instanceof Error ? e.message : e);
  }
}

export const notificationService = { listNotifications, markRead, markAllRead, notify, client: supabase };
