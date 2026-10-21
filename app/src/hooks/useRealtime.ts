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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_seasons' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_teams' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_team_members' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_team_invites' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_matchdays' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_fixtures' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_lineups' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_duels' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_duel_reports' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_substitutions' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_penalties' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_tiebreak_orders' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_byes' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_team_invites' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_disputes' }, () => {
        qc.invalidateQueries({ queryKey: ['league'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);
}
