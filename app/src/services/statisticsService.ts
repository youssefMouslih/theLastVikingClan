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

export interface RecentMatch {
  id: string;
  competition_id: string;
  player_a_id: string;
  player_b_id: string;
  score_a: number | null;
  score_b: number | null;
  status: string;
  opponent: { id: string; username: string; display_name: string | null; avatar_url: string | null };
  mine: number;
  theirs: number;
  result: 'W' | 'D' | 'L';
}

// Last N confirmed matches with opponent identity (for profile history).
export async function getRecentMatches(playerId: string, limit = 5): Promise<RecentMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('id,competition_id,player_a_id,player_b_id,score_a,score_b,status')
    .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
    .in('status', ['CONFIRMED', 'FORFEIT'])
    .order('confirmed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const ms = (data ?? []) as { id: string; competition_id: string; player_a_id: string; player_b_id: string; score_a: number | null; score_b: number | null; status: string }[];
  const oppIds = [...new Set(ms.map((m) => (m.player_a_id === playerId ? m.player_b_id : m.player_a_id)))];
  let profMap = new Map<string, { id: string; username: string; display_name: string | null; avatar_url: string | null }>();
  if (oppIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', oppIds);
    profMap = new Map(((profs ?? []) as { id: string; username: string; display_name: string | null; avatar_url: string | null }[]).map((p) => [p.id, p]));
  }
  return ms
    .filter((m) => m.score_a != null && m.score_b != null)
    .map((m) => {
      const isA = m.player_a_id === playerId;
      const mine = isA ? m.score_a! : m.score_b!;
      const theirs = isA ? m.score_b! : m.score_a!;
      const oppId = isA ? m.player_b_id : m.player_a_id;
      const opp = profMap.get(oppId) ?? { id: oppId, username: '?', display_name: null, avatar_url: null };
      return {
        id: m.id, competition_id: m.competition_id, player_a_id: m.player_a_id, player_b_id: m.player_b_id,
        score_a: m.score_a, score_b: m.score_b, status: m.status, opponent: opp, mine, theirs,
        result: (mine > theirs ? 'W' : mine < theirs ? 'L' : 'D') as 'W' | 'D' | 'L',
      };
    });
}

export const statisticsService = { getPlayerCareer, getHeadToHead, getClanTotals, getHallOfFame, getRecentMatches, getStreaks, checkStreakBadges, getHonours, client: supabase };

// Win-streak tracking (season badges).
export async function getStreaks(playerId: string): Promise<{ current: number; longest: number }> {
  const { data, error } = await supabase
    .from('matches')
    .select('player_a_id,player_b_id,score_a,score_b')
    .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
    .in('status', ['CONFIRMED', 'FORFEIT'])
    .order('confirmed_at', { ascending: true });
  if (error) return { current: 0, longest: 0 };
  let cur = 0, longest = 0;
  for (const m of (data ?? []) as { player_a_id: string; player_b_id: string; score_a: number | null; score_b: number | null }[]) {
    if (m.score_a == null || m.score_b == null) continue;
    const mine = m.player_a_id === playerId ? m.score_a : m.score_b;
    const theirs = m.player_a_id === playerId ? m.score_b : m.score_a;
    if (mine > theirs) {
      cur++;
      longest = Math.max(longest, cur);
    } else {
      cur = 0;
    }
  }
  return { current: cur, longest };
}

export async function checkStreakBadges(playerId: string, competitionId: string | null): Promise<void> {
  try {
    const { longest } = await getStreaks(playerId);
    const { data: has } = await supabase.from('achievements').select('type').eq('player_id', playerId);
    const types = new Set(((has ?? []) as { type: string }[]).map((a) => a.type));
    const awards: { type: string; name: string }[] = [];
    if (longest >= 5 && !types.has('STREAK_5')) awards.push({ type: 'STREAK_5', name: 'War Streak x5' });
    if (longest >= 10 && !types.has('STREAK_10')) awards.push({ type: 'STREAK_10', name: 'Unbroken x10' });
    for (const a of awards) {
      const { error } = await supabase.from('achievements').insert({ player_id: playerId, competition_id: competitionId, type: a.type, name: a.name, description: 'Consecutive verified wins.' });
      if (!error) await supabase.from('notifications').insert({ user_id: playerId, type: 'COMPETITION_FINISHED', title: `Badge: ${a.name}`, message: 'A new battle honor is yours.' });
    }
  } catch { /* badges never break results */ }
}

export interface Honour {
  id: string;
  type: string;
  name: string;
  awarded_at: string;
}

export async function getHonours(playerId: string): Promise<Honour[]> {
  const { data } = await supabase.from('achievements').select('id,type,name,awarded_at').eq('player_id', playerId).order('awarded_at', { ascending: false }).limit(20);
  return (data ?? []) as Honour[];
}
