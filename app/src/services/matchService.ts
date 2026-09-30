import { generateRoundRobin } from '../competition/leagueEngine';
import { generateKnockout } from '../competition/knockoutEngine';
import { supabase } from '../lib/supabase';
import type { Match } from '../types/database';
import { notify } from './notificationService';
import { awardXP } from './sagaService';
import { checkStreakBadges, getPlayerCareer } from './statisticsService';
import { uploadMatchEvidence } from './storageService';

export async function listCompetitionMatches(competitionId: string): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('competition_id', competitionId)
    .order('deadline', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Match[];
}

export async function getMatch(id: string): Promise<Match | null> {
  const { data, error } = await supabase.from('matches').select('*').eq('id', id).single();
  if (error) return null;
  return data as Match;
}

// League fixture generation (§29, §95). Creates rounds + matches with per-match deadlines.
// Throws if below min players (§27).
export async function generateLeagueFixtures(competitionId: string): Promise<number> {
  const { data: comp } = await supabase.from('competitions').select('*').eq('id', competitionId).single();
  if (!comp) throw new Error('Competition not found.');
  const c = comp as { min_players: number; match_deadline_hours: number; start_date: string | null };
  const { data: parts } = await supabase.from('competition_participants').select('player_id').eq('competition_id', competitionId);
  const playerIds = ((parts ?? []) as { player_id: string }[]).map((p) => p.player_id);
  if (playerIds.length < c.min_players) {
    throw new Error(`Not enough players: ${playerIds.length} / ${c.min_players} minimum. Extend registration or cancel (§27).`);
  }
  const { count } = await supabase.from('matches').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId);
  if ((count ?? 0) > 0) throw new Error('Fixtures already exist. Delete matches before regenerating.');

  const fixtures = generateRoundRobin(playerIds);
  const base = c.start_date ? new Date(c.start_date).getTime() : Date.now();
  const stepMs = c.match_deadline_hours * 3600 * 1000;
  const roundNumbers = [...new Set(fixtures.map((f) => f.round_number))].sort((a, b) => a - b);

  let created = 0;
  for (const rn of roundNumbers) {
    const deadline = new Date(base + rn * stepMs).toISOString();
    const { data: round } = await supabase
      .from('rounds')
      .insert({ competition_id: competitionId, round_number: rn, name: `Matchday ${rn}`, deadline, status: 'SCHEDULED' })
      .select('id')
      .single();
    const roundId = (round as { id: string } | null)?.id ?? null;
    const roundFixtures = fixtures.filter((f) => f.round_number === rn);
    const rows = roundFixtures.map((f) => ({
      competition_id: competitionId,
      round_id: roundId,
      player_a_id: f.player_a_id,
      player_b_id: f.player_b_id,
      status: 'SCHEDULED',
      scheduled_at: new Date().toISOString(),
      deadline,
    }));
    const { error } = await supabase.from('matches').insert(rows);
    if (error) throw new Error(error.message);
    created += rows.length;
  }
  await supabase.from('competitions').update({ status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', competitionId);
  return created;
}

// Knockout generation (§52-56). V1: creates Round 1 matches; later rounds advance via admin.
export async function generateKnockoutFixtures(competitionId: string): Promise<number> {
  const { data: comp } = await supabase.from('competitions').select('*').eq('id', competitionId).single();
  if (!comp) throw new Error('Competition not found.');
  const c = comp as { min_players: number; match_deadline_hours: number; start_date: string | null };
  const { data: parts } = await supabase.from('competition_participants').select('player_id').eq('competition_id', competitionId).order('joined_at');
  const playerIds = ((parts ?? []) as { player_id: string }[]).map((p) => p.player_id);
  if (![4, 8, 16].includes(playerIds.length)) {
    throw new Error(`Knockout needs 4, 8 or 16 players (§55). Got ${playerIds.length}.`);
  }
  if (playerIds.length < c.min_players) throw new Error(`Not enough players: ${playerIds.length} / ${c.min_players} minimum.`);
  const { count } = await supabase.from('matches').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId);
  if ((count ?? 0) > 0) throw new Error('Fixtures already exist.');

  // Validate with engine (throws on bad size), then build R1 only
  void generateKnockout(playerIds);
  const base = c.start_date ? new Date(c.start_date).getTime() : Date.now();
  const deadline = new Date(base + c.match_deadline_hours * 3600 * 1000).toISOString();
  const { data: round } = await supabase
    .from('rounds')
    .insert({ competition_id: competitionId, round_number: 1, name: 'Round 1', deadline, status: 'SCHEDULED' })
    .select('id')
    .single();
  const roundId = (round as { id: string } | null)?.id ?? null;
  const rows = [];
  for (let i = 0; i < playerIds.length; i += 2) {
    rows.push({
      competition_id: competitionId,
      round_id: roundId,
      player_a_id: playerIds[i],
      player_b_id: playerIds[i + 1],
      status: 'SCHEDULED',
      scheduled_at: new Date().toISOString(),
      deadline,
    });
  }
  const { error } = await supabase.from('matches').insert(rows);
  if (error) throw new Error(error.message);
  await supabase.from('competitions').update({ status: 'ACTIVE', updated_at: new Date().toISOString() }).eq('id', competitionId);
  return rows.length;
}

// Result submission (§37-38, §102). Evidence optional but recommended.
export async function submitResult(
  match: Match,
  userId: string,
  scoreA: number,
  scoreB: number,
  evidence?: File | null,
  comment?: string | null,
) {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    throw new Error('Scores must be whole numbers >= 0.');
  }
  if (userId !== match.player_a_id && userId !== match.player_b_id) throw new Error('Only participants can submit this result.');
  if (match.deadline && Date.now() > new Date(match.deadline).getTime() && match.status !== 'OVERDUE') {
    throw new Error('Deadline passed. Contact an admin.');
  }
  if (match.status === 'CONFIRMED') throw new Error('Players cannot modify confirmed results (Rule 8).');
  if (!evidence) throw new Error('Screenshot evidence is required — no photo, no result.');
  // Replace previous evidence so resubmits don't orphan files.
  try {
    const { data: old } = await supabase.from('match_evidence').select('id,file_path').eq('match_id', match.id);
    for (const r of ((old ?? []) as { id: string; file_path: string }[])) {
      await supabase.storage.from('match-evidence').remove([r.file_path]);
    }
    if (old?.length) await supabase.from('match_evidence').delete().eq('match_id', match.id);
  } catch { /* keep going; round purge cleans leftovers */ }
  await uploadMatchEvidence(evidence, match.competition_id, match.id, userId);
  const { error } = await supabase
    .from('matches')
    .update({ score_a: scoreA, score_b: scoreB, status: 'RESULT_SUBMITTED', submitted_by: userId, submitted_at: new Date().toISOString(), submission_comment: comment?.trim() || null, moderation_comment: null, updated_at: new Date().toISOString() })
    .eq('id', match.id);
  if (error) throw new Error(error.message);
  const opponent = match.player_a_id === userId ? match.player_b_id : match.player_a_id;
  await notify(opponent, 'RESULT_SUBMITTED', 'Result submitted', `Your opponent submitted ${scoreA}–${scoreB}. Confirm or dispute.`, { type: 'match', id: match.id });
}

// Confirmation (§39-40). Must be the opponent, not the submitter.
export async function confirmResult(match: Match, userId: string) {
  if (match.status !== 'RESULT_SUBMITTED') throw new Error('Nothing to confirm.');
  if (match.submitted_by === userId) throw new Error('The submitter cannot confirm their own result — opponent must confirm.');
  if (userId !== match.player_a_id && userId !== match.player_b_id) throw new Error('Only the opponent can confirm.');
  const winner = match.score_a! > match.score_b! ? match.player_a_id : match.score_a! < match.score_b! ? match.player_b_id : null;
  const { error } = await supabase
    .from('matches')
    .update({ status: 'CONFIRMED', confirmed_by: userId, confirmed_at: new Date().toISOString(), winner_id: winner, updated_at: new Date().toISOString() })
    .eq('id', match.id);
  if (error) throw new Error(error.message);
  if (match.submitted_by && match.submitted_by !== userId) {
    await notify(match.submitted_by, 'RESULT_CONFIRMED', 'Result confirmed', `Your ${match.score_a}–${match.score_b} result was confirmed. Standings updated.`, { type: 'match', id: match.id });
  }
  // Saga: Glory for verified battles (winner 30 / draw 15 / loser 10).
  try {
    const aWon = match.score_a! > match.score_b!;
    const draw = match.score_a === match.score_b;
    await awardXP(match.player_a_id, aWon ? 30 : draw ? 15 : 10, aWon ? 'match-win' : draw ? 'match-draw' : 'match-played', 'match', match.id);
    await awardXP(match.player_b_id, !aWon ? 30 : draw ? 15 : 10, !aWon ? 'match-win' : draw ? 'match-draw' : 'match-played', 'match', match.id);
    for (const pid of [match.player_a_id, match.player_b_id]) {
      const career = await getPlayerCareer(pid).catch(() => null);
      if (career && career.played === 1) {
        const { error } = await supabase.from('achievements').insert({ player_id: pid, competition_id: match.competition_id, type: 'FIRST_BLOOD', name: 'First Blood', description: 'Completed first verified clan match.' });
        if (!error) await notify(pid, 'COMPETITION_FINISHED', 'Achievement: First Blood', 'You completed your first verified clan match.');
      }
      await checkStreakBadges(pid, match.competition_id);
    }
  } catch { /* XP never breaks results */ }
}

export async function adminRejectResult(match: Match, adminId: string, comment: string): Promise<void> {
  if (!comment.trim()) throw new Error('A comment is required to send a result back.');
  if (match.status !== 'RESULT_SUBMITTED' && match.status !== 'DISPUTED') throw new Error('Nothing to send back.');
  const { error } = await supabase
    .from('matches')
    .update({ status: 'SCHEDULED', submitted_by: null, submitted_at: null, moderation_comment: comment.trim(), updated_at: new Date().toISOString() })
    .eq('id', match.id);
  if (error) throw new Error(error.message);
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_REJECTED_RESULT', entity_type: 'match', entity_id: match.id, reason: comment.trim() });
  for (const pid of [match.player_a_id, match.player_b_id]) {
    await notify(pid, 'RESULT_DISPUTED', 'Result sent back', `Moderator: ${comment.trim()} — replay or resubmit.`, { type: 'match', id: match.id });
  }
}

export async function disputeResult(matchId: string, userId: string, reason: string, description: string) {
  const { error: dErr } = await supabase.from('disputes').insert({ match_id: matchId, created_by: userId, reason, description, status: 'OPEN' });
  if (dErr) throw new Error(dErr.message);
  const { error } = await supabase.from('matches').update({ status: 'DISPUTED', updated_at: new Date().toISOString() }).eq('id', matchId);
  if (error) throw new Error(error.message);
  // Notify staff (best-effort)
  const { data: staff } = await supabase.from('profiles').select('id').in('role', ['OWNER', 'ADMIN', 'MODERATOR']).eq('status', 'ACTIVE');
  for (const s of (staff ?? []) as { id: string }[]) {
    if (s.id !== userId) await notify(s.id, 'RESULT_DISPUTED', 'New dispute', `${reason} — review needed.`, { type: 'match', id: matchId });
  }
}

export async function adminSetResult(matchId: string, scoreA: number, scoreB: number, adminId: string, competitionId: string, playerA: string, playerB: string) {
  const winner = scoreA > scoreB ? playerA : scoreA < scoreB ? playerB : null;
  const { error } = await supabase
    .from('matches')
    .update({ score_a: scoreA, score_b: scoreB, status: 'CONFIRMED', confirmed_by: adminId, confirmed_at: new Date().toISOString(), winner_id: winner, updated_at: new Date().toISOString() })
    .eq('id', matchId);
  if (error) throw new Error(error.message);
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_CHANGED_MATCH_RESULT', entity_type: 'match', entity_id: matchId, new_data: { scoreA, scoreB }, reason: 'dispute resolution' });
  void competitionId;
}

export async function awardForfeit(matchId: string, winnerId: string, loserId: string, adminId: string) {
  // Default forfeit score 3–0 (§45)
  const isA = winnerId !== loserId;
  void isA;
  const { data: m } = await supabase.from('matches').select('player_a_id,player_b_id').eq('id', matchId).single();
  const mm = m as { player_a_id: string; player_b_id: string } | null;
  if (!mm) throw new Error('Match not found.');
  const scoreA = mm.player_a_id === winnerId ? 3 : 0;
  const scoreB = mm.player_b_id === winnerId ? 3 : 0;
  const { error } = await supabase
    .from('matches')
    .update({ score_a: scoreA, score_b: scoreB, status: 'FORFEIT', winner_id: winnerId, forfeit_player_id: loserId, confirmed_by: adminId, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', matchId);
  if (error) throw new Error(error.message);
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_AWARDED_FORFEIT', entity_type: 'match', entity_id: matchId, new_data: { winnerId, loserId } });
}

export async function markOverdue(competitionId: string): Promise<number> {  const { data } = await supabase.from('matches').select('id,deadline,status').eq('competition_id', competitionId).in('status', ['SCHEDULED', 'RESULT_SUBMITTED']);
  const now = Date.now();
  const overdue = ((data ?? []) as { id: string; deadline: string | null }[]).filter((m) => m.deadline && now > new Date(m.deadline).getTime());
  for (const m of overdue) {
    await supabase.from('matches').update({ status: 'OVERDUE', updated_at: new Date().toISOString() }).eq('id', m.id);
  }
  return overdue.length;
}

// Home screen (§16): user's next actionable match across competitions.
export async function listMyUpcoming(userId: string, limit = 3): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
    .in('status', ['SCHEDULED', 'RESULT_SUBMITTED', 'OVERDUE'])
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Match[];
}

// Activity feed (§66): latest confirmed results across the clan.
export async function recentConfirmedResults(limit = 5): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .in('status', ['CONFIRMED', 'FORFEIT'])
    .order('confirmed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Match[];
}

export const matchService = {
  listCompetitionMatches,
  getMatch,
  listMyUpcoming,
  recentConfirmedResults,
  generateLeagueFixtures,
  generateKnockoutFixtures,
  submitResult,
  confirmResult,
  adminRejectResult,
  disputeResult,
  adminSetResult,
  awardForfeit,
  markOverdue,
  client: supabase,
};
