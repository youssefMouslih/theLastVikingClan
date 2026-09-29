import { supabase } from '../lib/supabase';
import type { AnnouncementPriority } from '../types/database';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  created_by: string | null;
  published_at: string;
  expires_at: string | null;
}

// Active announcements (§65): published and not expired.
export async function listActiveAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const now = Date.now();
  return ((data ?? []) as Announcement[]).filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > now);
}

export async function createAnnouncement(
  input: { title: string; content: string; priority: AnnouncementPriority; expires_at?: string | null },
  adminId: string,
): Promise<Announcement> {
  const { data, error } = await supabase
    .from('announcements')
    .insert({ title: input.title.trim(), content: input.content.trim(), priority: input.priority, created_by: adminId, expires_at: input.expires_at ?? null })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Announcement;
}

export async function deleteAnnouncement(id: string) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export const announcementService = { listActiveAnnouncements, createAnnouncement, deleteAnnouncement, client: supabase };
