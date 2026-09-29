import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Realtime binder (§90): live standings, notifications, results, activity.
// Mount once inside QueryClientProvider. Failures are non-fatal (polling fallback via staleTime).
export function useRealtime(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel('vik-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        qc.invalidateQueries({ queryKey: ['matches'] });
        qc.invalidateQueries({ queryKey: ['match'] });
        qc.invalidateQueries({ queryKey: ['standings'] });
        qc.invalidateQueries({ queryKey: ['career'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competitions' }, () => {
        qc.invalidateQueries({ queryKey: ['competitions'] });
        qc.invalidateQueries({ queryKey: ['competition'] });
        qc.invalidateQueries({ queryKey: ['admin-competitions'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'competition_participants' }, () => {
        qc.invalidateQueries({ queryKey: ['participants'] });
        qc.invalidateQueries({ queryKey: ['members'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        qc.invalidateQueries({ queryKey: ['announcements'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes' }, () => {
        qc.invalidateQueries({ queryKey: ['disputes-open'] });
        qc.invalidateQueries({ queryKey: ['disputes-count'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);
}
