import { supabase } from '../lib/supabase';
import type { LeagueSeason, LeagueSeasonStatus } from '../types/league4v4';

const STATUS_PRIORITY: Record<LeagueSeasonStatus, number> = {
  ACTIVE: 0,
  REGISTRATION: 1,
  DRAFT: 2,
  COMPLETED: 3,
  ARCHIVED: 4,
};

export async function listLeagueSeasons(): Promise<LeagueSeason[]> {
  const { data, error } = await supabase
    .from('league_seasons')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueSeason[];
}

export async function getLeagueSeason(seasonId: string): Promise<LeagueSeason | null> {
  const { data, error } = await supabase
    .from('league_seasons')
    .select('*')
    .eq('id', seasonId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as LeagueSeason | null) ?? null;
}

export function pickCurrentLeagueSeason(seasons: LeagueSeason[]): LeagueSeason | null {
  if (seasons.length === 0) return null;
  return [...seasons].sort((a, b) => {
    const byStatus = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (byStatus !== 0) return byStatus;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}
