import { supabase } from '../lib/supabase';
import type { Challenge, ChallengeType } from '../types/database';
import { notify } from './notificationService';
import { getTotalXP } from './sagaService';
import { uploadBattleEvidence } from './storageService';

export interface IssueChallengeInput {
  opponent_id?: string | null;
  type: ChallengeType;
  conditions?: string | null;
  stakes?: string | null;
  for_throne?: boolean;
  forced?: boolean;
  openCall?: boolean;
}

export interface ChallengeRow extends Challenge {
  challenger?: { id: string; username: string; display_name: string | null; avatar_url: string | null; whatsapp: string | null } | null;
  opponent?: { id: string; username: string; display_name: string | null; avatar_url: string | null; whatsapp: string | null } | null;
}

const WITH_PROFILES = '*,challenger:profiles!challenges_challenger_id_fkey(id,username,display_name,avatar_url,whatsapp),opponent:profiles!challenges_opponent_id_fkey(id,username,display_name,avatar_url,whatsapp)';

export async function issueChallenge(input: IssueChallengeInput, challengerId: string): Promise<Challenge> {
  if (input.openCall) {
    if (input.type !== 'FRIENDLY') throw new Error('Only friendlies can be open calls.');
  } else {
    if (!input.opponent_id) throw new Error('Choose a clan member.');
    if (input.opponent_id === challengerId) throw new Error('You cannot challenge yourself.');
  }
  if (input.forced) {
    if (input.type !== 'HEAD') throw new Error('Only Calls for a Head can be unrefusable.');
    if (!input.opponent_id) throw new Error('Unrefusable calls target a clan member.');
    const balance = await getTotalXP(challengerId).catch(() => 0);
    if (balance < 100) throw new Error('Unrefusable calls require holding 100 GP.');
  }
  if (input.for_throne) {
    // One active throne pledge per challenger — no stacking duplicate claims.
    const { data: dupes, error: dErr } = await supabase
      .from('challenges')
      .select('id')
      .eq('challenger_id', challengerId)
      .eq('for_throne', true)
      .in('status', ['PENDING', 'ACCEPTED', 'RESULT_SUBMITTED'])
      .limit(1);
    if (dErr) throw new Error(dErr.message);
    if (dupes && dupes.length > 0) throw new Error('You already have an active throne challenge — resolve it first.');
  }
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      challenger_id: challengerId,
      opponent_id: input.opponent_id ?? null,
      opponent_label: null,
      type: input.type,
      conditions: input.conditions ?? null,
      stakes: input.stakes ?? null,
      for_throne: input.for_throne ?? false,
      forced: input.forced ?? false,
      is_open: input.openCall ?? false,
      expires_at: input.openCall ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  const created = data as Challenge;
  if (input.openCall) {
    // Clan-wide raven: every active member sees the open mat.
    try {
      const { data: members } = await supabase.from('profiles').select('id').eq('status', 'ACTIVE');
      for (const mm of ((members ?? []) as { id: string }[]).filter((mm) => mm.id !== challengerId)) {
        await notify(mm.id, 'COMPETITION_INVITATION', 'Open mat: friendly wanted', 'A brother seeks a friendly — take the fight.', { type: 'battle', id: created.id });
      }
    } catch { /* alerts never break issuing */ }
  } else if (input.opponent_id) {
    await notify(input.opponent_id, 'COMPETITION_INVITATION', 'You have been challenged', 'A clan battle awaits your answer.', { type: 'battle', id: created.id });
  }
  return created;
}

export async function listOpenBattles(myId: string): Promise<ChallengeRow[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select(WITH_PROFILES)
    .eq('is_open', true)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  void myId;
  return (data ?? []) as unknown as ChallengeRow[];
}

// Ghost sweep: open calls past expiry auto-cancel on view.
export async function expireStaleOpenCalls(): Promise<number> {
  const { data, error } = await supabase
    .from('challenges')
    .select('id')
    .eq('is_open', true)
    .eq('status', 'PENDING')
    .lt('expires_at', new Date().toISOString());
  if (error) return 0;
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return 0;
  await supabase.from('challenges').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).in('id', ids);
  return ids.length;
}

export async function renewCall(challengeId: string): Promise<void> {
  const { error } = await supabase
    .from('challenges')
    .update({ expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), updated_at: new Date().toISOString() })
    .eq('id', challengeId)
    .eq('status', 'PENDING');
  if (error) throw new Error(error.message);
}

export async function acceptOpenBattle(ch: ChallengeRow, userId: string): Promise<void> {  if (!ch.is_open || ch.status !== 'PENDING') throw new Error('Already taken.');
  if (ch.challenger_id === userId) throw new Error('That is your own call.');
  const { error } = await supabase
    .from('challenges')
    .update({ opponent_id: userId, is_open: false, status: 'ACCEPTED', responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', ch.id)
    .eq('status', 'PENDING');
  if (error) throw new Error(error.message);
  await notify(ch.challenger_id, 'COMPETITION_STARTED', 'Open call answered', 'A brother took your fight. To battle.');
}

export async function listIncoming(userId: string): Promise<ChallengeRow[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select(WITH_PROFILES)
    .eq('opponent_id', userId)
    .in('status', ['PENDING', 'ACCEPTED', 'RESULT_SUBMITTED'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ChallengeRow[];
}

export async function listOutgoing(userId: string): Promise<ChallengeRow[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select(WITH_PROFILES)
    .eq('challenger_id', userId)
    .not('status', 'in', '(COMPLETED,CANCELLED)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ChallengeRow[];
}

export async function listBattleHistory(userId: string, limit = 20): Promise<ChallengeRow[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select(WITH_PROFILES)
    .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
    .in('status', ['COMPLETED', 'CANCELLED', 'DECLINED'])
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ChallengeRow[];
}

export async function respondChallenge(ch: ChallengeRow, userId: string, accept: boolean): Promise<void> {
  if (ch.opponent_id !== userId) throw new Error('Only the challenged player may answer.');
  if (ch.status !== 'PENDING') throw new Error('Already answered.');
  const { error } = await supabase
    .from('challenges')
    .update({ status: accept ? 'ACCEPTED' : 'DECLINED', responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', ch.id);
  if (error) throw new Error(error.message);
  await notify(ch.challenger_id, accept ? 'COMPETITION_STARTED' : 'COMPETITION_FINISHED', accept ? 'Challenge accepted' : 'Challenge declined', accept ? 'To battle.' : 'They refused the call.');
}

export async function submitBattleResult(ch: ChallengeRow, userId: string, scoreA: number, scoreB: number, evidence?: File | null) {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) throw new Error('Scores must be whole numbers >= 0.');
  if (ch.status !== 'ACCEPTED') throw new Error('Challenge is not active.');
  if (!evidence) throw new Error('Screenshot evidence is required — no photo, no result.');
  if (ch.evidence_path) {
    try {
      await supabase.storage.from('match-evidence').remove([ch.evidence_path]);
    } catch { /* keep going */ }
  }
  const path = await uploadBattleEvidence(evidence, ch.id, userId);
  const { error } = await supabase
    .from('challenges')
    .update({ score_a: scoreA, score_b: scoreB, status: 'RESULT_SUBMITTED', submitted_by: userId, evidence_path: path, updated_at: new Date().toISOString() })
    .eq('id', ch.id);
  if (error) throw new Error(error.message);
  const other = ch.challenger_id === userId ? ch.opponent_id : ch.challenger_id;
  if (other) await notify(other, 'RESULT_SUBMITTED', 'Battle result submitted', `${scoreA}–${scoreB} awaits your confirmation.`);
}

export async function confirmBattleResult(ch: ChallengeRow, userId: string): Promise<'defended' | 'transfer' | 'draw' | null> {
  if (ch.status !== 'RESULT_SUBMITTED') throw new Error('Nothing to confirm.');
  if (ch.submitted_by === userId) throw new Error('The submitter cannot confirm — the other warrior must.');
  const { error } = await supabase
    .from('challenges')
    .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
    .eq('id', ch.id);
  if (error) throw new Error(error.message);
  if (ch.submitted_by) await notify(ch.submitted_by, 'RESULT_CONFIRMED', 'Battle recorded', 'The outcome stands in clan history.');
  // Saga Glory via secured RPC (0034 grant_battle_rewards). Best-effort.
  try {
    const { error: rpcErr } = await supabase.rpc('grant_battle_rewards', { p_challenge_id: ch.id });
    if (rpcErr) console.warn('rewards skipped:', rpcErr.message);
  } catch { /* XP never breaks results */ }
  // Throne: score_a = challenger goals, score_b = opponent goals by convention.
  if (ch.for_throne && ch.opponent_id && ch.score_a != null && ch.score_b != null) {
    try {
      const { data, error } = await supabase.rpc('settle_throne_battle', { p_challenge_id: ch.id });
      if (error) throw new Error(error.message);
      const outcome = (data as 'defended' | 'transfer' | 'draw' | null) ?? null;
      if (outcome === 'transfer') {
        await notify(ch.challenger_id, 'COMPETITION_FINISHED', 'THE THRONE IS YOURS', 'The clan bows to its new champion.');
        await notify(ch.opponent_id, 'COMPETITION_FINISHED', 'The throne has fallen', 'A new champion reigns.');
      }
      return outcome;
    } catch (e) {
      console.warn('throne settle skipped:', e instanceof Error ? e.message : e);
    }
  }
  return null;
}

export async function cancelChallenge(ch: ChallengeRow, userId: string): Promise<void> {
  const { error } = await supabase
    .from('challenges')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', ch.id);
  if (error) throw new Error(error.message);
  void userId;
}

export const challengeService = {
  issueChallenge,
  listIncoming,
  listOutgoing,
  listBattleHistory,
  listOpenBattles,
  acceptOpenBattle,
  expireStaleOpenCalls,
  renewCall,
  respondChallenge,
  submitBattleResult,
  confirmBattleResult,
  cancelChallenge,
  client: supabase,
};
