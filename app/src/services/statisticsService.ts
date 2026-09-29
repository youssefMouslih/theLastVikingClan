import { calculateStandings } from '../competition/standingsEngine';
import { supabase } from '../lib/supabase';
import type { Match } from '../types/database';

export interface CareerStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  winRate: number;
  form: ('W' | 'D' | 'L')[];
  titles: number;
}

type CMatch = Pick<Match, 'player_a_id' | 'player_b_id' | 'score_a' | 'score_b' | 'status' | 'competition_id' | 'confirmed_at'>;

// Career stats (§59): all CONFIRMED/FORFEIT matches across competitions.
export async function getPlayerCareer(playerId: string): Promise<CareerStats> {
  const { data, error } = await supabase
    .from('matches')
    .select('player_a_id,player_b_id,score_a,score_b,status,competition_id,confirmed_at')
    .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
    .in('status', ['CONFIRMED', 'FORFEIT'])
    .order('confirmed_at', { ascending: false });
  if (error) throw new Error(error.message);
  const ms = (data ?? []) as CMatch[];
  let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
  const form: ('W' | 'D' | 'L')[] = [];
  for (const m of ms) {
    if (m.score_a == null || m.score_b == null) continue;
    const mine = m.player_a_id === playerId ? m.score_a : m.score_b;
    const theirs = m.player_a_id === playerId ? m.score_b : m.score_a;
    gf += mine; ga += theirs;
    const r = mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
    if (form.length < 5) form.unshift(r);
    if (r === 'W') wins++; else if (r === 'L') losses++; else draws++;
  }
  const { count } = await supabase.from('achievements').select('id', { count: 'exact', head: true }).eq('player_id', playerId).ilike('type', '%CHAMPION%');
  const played = wins + draws + losses;
  return { played, wins, draws, losses, goals_for: gf, goals_against: ga, winRate: played ? Math.round((wins / played) * 100) : 0, form, titles: count ?? 0 };
}

export async function getHeadToHead(a: string, b: string) {
  const { data, error } = await supabase
    .from('matches')
    .select('player_a_id,player_b_id,score_a,score_b,status')
    .in('status', ['CONFIRMED', 'FORFEIT'])
    .or(`and(player_a_id.eq.${a},player_b_id.eq.${b}),and(player_a_id.eq.${b},player_b_id.eq.${a})`);
  if (error) throw new Error(error.message);
  let aWins = 0, draws = 0, bWins = 0, aGoals = 0, bGoals = 0;
  for (const m of (data ?? []) as Pick<Match, 'player_a_id' | 'player_b_id' | 'score_a' | 'score_b'>[]) {
    if (m.score_a == null || m.score_b == null) continue;
    const as = m.player_a_id === a ? m.score_a : m.score_b;
    const bs = m.player_a_id === a ? m.score_b : m.score_a;
    aGoals += as; bGoals += bs;
    if (as > bs) aWins++; else if (as < bs) bWins++; else draws++;
  }
  return { matches: (data ?? []).length, aWins, draws, bWins, aGoals, bGoals };
}

export async function getClanTotals() {
  const [{ count: members }, { count: matches }, { data: finished }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    supabase.from('matches').select('id', { count: 'exact', head: true }).in('status', ['CONFIRMED', 'FORFEIT']),
    supabase.from('competitions').select('id').in('status', ['FINISHED', 'ARCHIVED']),
  ]);
  const { data: goals } = await supabase.from('matches').select('score_a,score_b').in('status', ['CONFIRMED', 'FORFEIT']);
  const totalGoals = (goals ?? []).reduce((s, m) => s + (m.score_a ?? 0) + (m.score_b ?? 0), 0);
  return { members: members ?? 0, matches: matches ?? 0, goals: totalGoals, seasons: (finished ?? []).length };
}

// Hall of Fame (§64): champion per finished competition.
export async function getHallOfFame(): Promise<{ competitionId: string; name: string; type: string; championId: string | null }[]> {
  const { data, error } = await supabase.from('competitions').select('id,name,type').in('status', ['FINISHED', 'ARCHIVED']).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const out: { competitionId: string; name: string; type: string; championId: string | null }[] = [];
  for (const c of (data ?? []) as { id: string; name: string; type: string }[]) {
    const { data: ms } = await supabase.from('matches').select('player_a_id,player_b_id,score_a,score_b,status,winner_id').eq('competition_id', c.id).in('status', ['CONFIRMED', 'FORFEIT']);
    const rows = calculateStandings((ms ?? []) as Pick<Match, 'player_a_id' | 'player_b_id' | 'score_a' | 'score_b' | 'status'>[]);
    out.push({ competitionId: c.id, name: c.name, type: c.type, championId: rows[0]?.player_id ?? null });
  }
  return out;
}

export const statisticsService = { getPlayerCareer, getHeadToHead, getClanTotals, getHallOfFame, client: supabase };
