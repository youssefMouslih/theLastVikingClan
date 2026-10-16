import { generateRoundRobin } from '../competition/leagueEngine';
import { generateKnockout } from '../competition/knockoutEngine';
import { supabase } from '../lib/supabase';
import type { Match } from '../types/database';
import { notify } from './notificationService';
import { purgeRoundEvidence, uploadMatchEvidence } from './storageService';

// Round end: when every match of a round is final (CONFIRMED/FORFEIT/
// CANCELLED), its result pictures are deleted to save storage. Best-effort
// — never blocks the result flow.
export async function maybePurgeFinishedRound(competitionId: string, roundId: string | null): Promise<number> {
  if (!roundId) return 0;
  try {
    const { count: open } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', competitionId)
      .eq('round_id', roundId)
      .not('status', 'in', '(CONFIRMED,FORFEIT,CANCELLED)');
    if ((open ?? 0) > 0) return 0;
    return await purgeRoundEvidence(competitionId, roundId);
  } catch {
    return 0;
  }
}

export async function listCompetitionMatches(competitionId: string): Promise<MatchWithPhones[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*,pa:profiles!matches_player_a_id_fkey(username,display_name,whatsapp),pb:profiles!matches_player_b_id_fkey(username,display_name,whatsapp)')
    .eq('competition_id', competitionId)
    .order('deadline', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MatchWithPhones[];
}

export interface MatchWithPhones extends Match {
  pa?: { username: string; display_name: string | null; whatsapp: string | null } | null;
  pb?: { username: string; display_name: string | null; whatsapp: string | null } | null;
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
      .insert({ competition_id: competitionId, round_number: rn, name: `Matchday ${rn}`, deadline, status: rn === roundNumbers[0] ? 'ACTIVE' : 'SCHEDULED' })
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
    .insert({ competition_id: competitionId, round_number: 1, name: 'Round 1', deadline, status: 'ACTIVE' })
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

// ---------- Round gating ----------
// A round opens (accepts submissions) when staff force-starts it (ACTIVE)
// or when every match of every earlier round is final. Round 1 is ACTIVE
// from fixture generation. Staff never need to touch anything in the
// normal flow — the next round opens itself when the current one ends.
export interface Round {
  id: string;
  competition_id: string;
  round_number: number;
  name: string;
  status: string;
}

export async function listRounds(competitionId: string): Promise<Round[]> {
  const { data, error } = await supabase
    .from('rounds')
    .select('id,competition_id,round_number,name,status')
    .eq('competition_id', competitionId)
    .order('round_number', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Round[];
}

// Staff (moderator included) force-starts a scheduled round early.
export async function startRound(roundId: string, actorId: string, actorRole: string): Promise<void> {
  if (!['OWNER', 'ADMIN', 'MODERATOR'].includes(actorRole)) {
    throw new Error('Only moderators and admins can start rounds.');
  }
  const { error } = await supabase.from('rounds').update({ status: 'ACTIVE' }).eq('id', roundId).eq('status', 'SCHEDULED');
  if (error) throw new Error(error.message);
  try {
    await supabase.from('audit_logs').insert({ actor_id: actorId, action: 'ADMIN_STARTED_ROUND', entity_type: 'round', entity_id: roundId });
  } catch { /* audit never blocks */ }
}

async function earlierRoundsComplete(competitionId: string, roundNumber: number): Promise<boolean> {
  const { data: rounds } = await supabase.from('rounds').select('id').eq('competition_id', competitionId).lt('round_number', roundNumber);
  const ids = ((rounds ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return true;
  const { count } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('competition_id', competitionId)
    .in('round_id', ids)
    .not('status', 'in', '(CONFIRMED,FORFEIT,CANCELLED)');
  return (count ?? 0) === 0;
}

export async function isRoundOpen(competitionId: string, roundId: string): Promise<{ open: boolean; roundNumber: number }> {
  const { data } = await supabase.from('rounds').select('round_number,status').eq('id', roundId).single();
  const round = data as { round_number: number; status: string } | null;
  if (!round) return { open: true, roundNumber: 0 }; // fail open: no round row, no gate
  if (round.status === 'ACTIVE') return { open: true, roundNumber: round.round_number };
  if (round.status !== 'SCHEDULED') return { open: false, roundNumber: round.round_number };
  const done = await earlierRoundsComplete(competitionId, round.round_number);
  return { open: done, roundNumber: round.round_number };
}

// Round advance now runs inside the 0035 server transaction
// (confirm_match / admin_set_result / award_match_forfeit);
// the client only gates submissions on round state. Kept as a deprecated
// no-op for compat — do not call in new code.
export async function maybeAdvanceRound(_competitionId: string, _roundId: string | null): Promise<void> {
  return;
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
  // Round gating: next round opens only when the previous round is fully
  // played, or when staff force-starts it early.
  if (match.round_id) {
    const gate = await isRoundOpen(match.competition_id, match.round_id);
    if (!gate.open) throw new Error(`Round ${gate.roundNumber} has not started yet.`);
  }
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

// Forfeit claim (§37 confirm step): the opponent concedes instead of
// confirming the score. Evidence stays blurred for non-admins until a
// moderator accepts (FORFEIT) or sends back.
export async function claimForfeit(match: Match, userId: string) {
  if (match.status !== 'RESULT_SUBMITTED') throw new Error('Nothing to confirm.');
  if (match.submitted_by === userId) throw new Error('The submitter cannot claim forfeit — opponent must confirm.');
  if (userId !== match.player_a_id && userId !== match.player_b_id) throw new Error('Only the opponent can claim forfeit.');
  if (match.forfeit_claimed_by) throw new Error('Forfeit already claimed — awaiting moderator.');
  const { error } = await supabase
    .from('matches')
    .update({ forfeit_claimed_by: userId, updated_at: new Date().toISOString() })
    .eq('id', match.id);
  if (error) throw new Error(error.message);
  if (match.submitted_by && match.submitted_by !== userId) {
    await notify(match.submitted_by, 'RESULT_DISPUTED', 'Forfeit claimed', 'Your opponent concedes — a moderator will review.', { type: 'match', id: match.id });
  }
  const { data: staff } = await supabase.from('profiles').select('id').in('role', ['OWNER', 'ADMIN', 'MODERATOR']).eq('status', 'ACTIVE');
  for (const s of (staff ?? []) as { id: string }[]) {
    if (s.id !== userId && s.id !== match.submitted_by) {
      await notify(s.id, 'RESULT_DISPUTED', 'Forfeit claim', 'Review needed: accept or send back.', { type: 'match', id: match.id });
    }
  }
}

// Confirmation (§39-40). Must be the opponent, not the submitter.
// Single server transaction (0035 confirm_match): validation, CONFIRMED +
// winner, XP, First Blood, streaks, round advance, submitter notice.
// Returns a purge flag; evidence deletion stays client-side. Tab-close safe:
// the server commits everything even if the client disconnects mid-call.
export async function confirmResult(match: Match, userId: string) {
  if (match.status !== 'RESULT_SUBMITTED') throw new Error('Nothing to confirm.');
  if (match.forfeit_claimed_by) throw new Error('Forfeit claim pending moderator review.');
  if (match.submitted_by === userId) throw new Error('The submitter cannot confirm their own result — opponent must confirm.');
  if (userId !== match.player_a_id && userId !== match.player_b_id) throw new Error('Only the opponent can confirm.');
  const { data, error } = await supabase.rpc('confirm_match', { p_match_id: match.id });
  if (error) throw new Error(error.message);
  if (data === true) {
    await maybePurgeFinishedRound(match.competition_id, match.round_id).catch(() => {});
  }
}

export async function adminRejectResult(match: Match, adminId: string, comment: string): Promise<void> {
  if (!comment.trim()) throw new Error('A comment is required to send a result back.');
  if (match.status !== 'RESULT_SUBMITTED' && match.status !== 'DISPUTED') throw new Error('Nothing to send back.');
  const { error } = await supabase
    .from('matches')
    .update({ status: 'SCHEDULED', submitted_by: null, submitted_at: null, forfeit_claimed_by: null, moderation_comment: comment.trim(), updated_at: new Date().toISOString() })
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

export async function adminSetResult(matchId: string, scoreA: number, scoreB: number, reason?: string | null) {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) {
    throw new Error('Scores must be whole numbers >= 0.');
  }
  const { data, error } = await supabase.rpc('admin_set_result', {
    p_match_id: matchId, p_score_a: scoreA, p_score_b: scoreB, p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  if (data === true) {
    const m = await getMatch(matchId);
    if (m) await maybePurgeFinishedRound(m.competition_id, m.round_id).catch(() => {});
  }
}

export async function awardForfeit(matchId: string, winnerId: string, reason?: string | null) {
  // Default forfeit score 3–0 (§45), oriented server-side.
  const { data, error } = await supabase.rpc('award_match_forfeit', {
    p_match_id: matchId, p_winner_id: winnerId, p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
  if (data === true) {
    const m = await getMatch(matchId);
    if (m) await maybePurgeFinishedRound(m.competition_id, m.round_id).catch(() => {});
  }
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
  claimForfeit,
  confirmResult,
  adminRejectResult,
  disputeResult,
  adminSetResult,
  awardForfeit,
  markOverdue,
  maybePurgeFinishedRound,
  listRounds,
  startRound,
  isRoundOpen,
  maybeAdvanceRound,
  client: supabase,
};
