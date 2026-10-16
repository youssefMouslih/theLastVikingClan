import { supabase } from '../lib/supabase';
import { notify } from './notificationService';

// Saga progression: Glory XP, Norse levels, quests, seasonal leaderboard.
// NOTE: awards run client-side best-effort (tables missing → skipped).
// Harden with Edge Functions before public launch (§100).

export interface Level {
  rank: number;
  nameKey: 'saga.lvl0' | 'saga.lvl1' | 'saga.lvl2' | 'saga.lvl3' | 'saga.lvl4' | 'saga.lvl5' | 'saga.lvl6' | 'saga.lvl7';
  min: number;
}

export const LEVELS: Level[] = [
  { rank: 1, nameKey: 'saga.lvl0', min: 0 },
  { rank: 2, nameKey: 'saga.lvl1', min: 100 },
  { rank: 3, nameKey: 'saga.lvl2', min: 300 },
  { rank: 4, nameKey: 'saga.lvl3', min: 600 },
  { rank: 5, nameKey: 'saga.lvl4', min: 1000 },
  { rank: 6, nameKey: 'saga.lvl5', min: 1600 },
  { rank: 7, nameKey: 'saga.lvl6', min: 2400 },
  { rank: 8, nameKey: 'saga.lvl7', min: 3500 },
];

export function levelFor(xp: number): { level: Level; next: Level | null; progress: number } {
  let level = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) level = l;
  const idx = LEVELS.indexOf(level);
  const next = LEVELS[idx + 1] ?? null;
  const progress = next ? Math.min(1, (xp - level.min) / (next.min - level.min)) : 1;
  return { level, next, progress };
}

export function currentSeason(): string {
  return `S${new Date().getFullYear()}`;
}

// Idempotent award: same (player, ref, reason) can never double-pay.
// @deprecated since 0034: direct inserts are denied by RLS. Reads stay;
// writes moved to secured RPCs (grant_match_rewards, grant_battle_rewards,
// claim_quest, answer_gift, claim_onboarding_reward). Kept for compat only.
export async function awardXP(playerId: string, amount: number, reason: string, refType: string, refId: string): Promise<void> {
  try {
    const { error } = await supabase.from('xp_ledger').insert({
      player_id: playerId,
      amount,
      reason,
      ref_type: refType,
      ref_id: refId,
      season: currentSeason(),
    });
    if (error && !error.message.includes('duplicate')) throw error;
  } catch (e) {
    console.warn('xp skipped:', e instanceof Error ? e.message : e);
  }
}

export async function getTotalXP(playerId: string): Promise<number> {
  const { data, error } = await supabase.from('xp_ledger').select('amount').eq('player_id', playerId);
  if (error) return 0;
  return ((data ?? []) as { amount: number }[]).reduce((s, r) => s + r.amount, 0);
}

export interface BoardEntry {
  player_id: string;
  xp: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export async function getSeasonBoard(limit = 20): Promise<BoardEntry[]> {
  const { data, error } = await supabase.from('xp_ledger').select('player_id,amount').eq('season', currentSeason());
  if (error) return [];
  const totals = new Map<string, number>();
  for (const r of (data ?? []) as { player_id: string; amount: number }[]) {
    totals.set(r.player_id, (totals.get(r.player_id) ?? 0) + r.amount);
  }
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (top.length === 0) return [];
  const { data: profs } = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', top.map(([id]) => id));
  const map = new Map(((profs ?? []) as { id: string; username: string; display_name: string | null; avatar_url: string | null }[]).map((p) => [p.id, p]));
  return top.map(([id, xp]) => ({
    player_id: id,
    xp,
    username: map.get(id)?.username ?? '?',
    display_name: map.get(id)?.display_name ?? null,
    avatar_url: map.get(id)?.avatar_url ?? null,
  }));
}

// ---- Quests (verified from real data; claims blocked per period) ----

export interface QuestDef {
  key: string;
  kind: 'daily' | 'weekly';
  xp: number;
  titleKey: 'saga.qBlood' | 'saga.qWanderer' | 'saga.qCaller' | 'saga.qSquire' | 'saga.qVeteran' | 'saga.qRival';
  norseKey: 'saga.qBloodNorse' | 'saga.qWandererNorse' | 'saga.qCallerNorse' | 'saga.qSquireNorse' | 'saga.qVeteranNorse' | 'saga.qRivalNorse';
  descKey: 'saga.qBloodD' | 'saga.qWandererD' | 'saga.qCallerD' | 'saga.qSquireD' | 'saga.qVeteranD' | 'saga.qRivalD';
  target: number;
}

export const QUESTS: QuestDef[] = [
  { key: 'first-blood', kind: 'daily', xp: 30, titleKey: 'saga.qBlood', norseKey: 'saga.qBloodNorse', descKey: 'saga.qBloodD', target: 1 },
  { key: 'wanderer', kind: 'daily', xp: 60, titleKey: 'saga.qWanderer', norseKey: 'saga.qWandererNorse', descKey: 'saga.qWandererD', target: 2 },
  { key: 'caller', kind: 'daily', xp: 15, titleKey: 'saga.qCaller', norseKey: 'saga.qCallerNorse', descKey: 'saga.qCallerD', target: 1 },
  { key: 'squire', kind: 'daily', xp: 20, titleKey: 'saga.qSquire', norseKey: 'saga.qSquireNorse', descKey: 'saga.qSquireD', target: 1 },
  { key: 'veteran', kind: 'weekly', xp: 80, titleKey: 'saga.qVeteran', norseKey: 'saga.qVeteranNorse', descKey: 'saga.qVeteranD', target: 3 },
  { key: 'rival', kind: 'weekly', xp: 50, titleKey: 'saga.qRival', norseKey: 'saga.qRivalNorse', descKey: 'saga.qRivalD', target: 1 },
];

function dayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function weekStart(): number {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday start
  d.setHours(0, 0, 0, 0);
  return d.getTime() - day * 86400000;
}

export function periodFor(kind: 'daily' | 'weekly'): string {
  const t = kind === 'daily' ? dayStart() : weekStart();
  return new Date(t).toISOString().slice(0, 10);
}

interface UserEvents {
  verifiedSince: { at: number; opp: string }[];
  challengedSince: number;
  confirmedSince: number;
  rematchSince: number;
}

export interface RematchEvent {
  challenger_id: string;
  opponent_id: string | null;
  type: string;
  created_at: string;
}

// Weekly Blood-Debt: a rematch counts only against a member opponent NOT
// faced in a rematch during the previous week (Monday-start, local time).
// Pure mirror of the server rule in claim_quest (0038) so the quest board
// shows honest progress; the server re-validates on claim.
export function rivalQuestQualifies(events: RematchEvent[], me: string, nowMs: number = Date.now()): boolean {
  const d = new Date(nowMs);
  const day = (d.getDay() + 6) % 7; // Monday start
  d.setHours(0, 0, 0, 0);
  const week = d.getTime() - day * 86400000;
  const prev = week - 7 * 86400000;
  const other = (e: RematchEvent): string | null =>
    e.challenger_id === me ? e.opponent_id : e.challenger_id;
  const prevOpps = new Set<string>();
  for (const e of events) {
    if (e.type !== 'REMATCH' || e.opponent_id == null) continue;
    const t = new Date(e.created_at).getTime();
    if (t < prev || t >= week) continue;
    const o = other(e);
    if (o != null) prevOpps.add(o);
  }
  return events.some((e) => {
    if (e.type !== 'REMATCH' || e.opponent_id == null) return false;
    const t = new Date(e.created_at).getTime();
    if (t < week) return false;
    const o = other(e);
    return o != null && !prevOpps.has(o);
  });
}

async function getUserEvents(userId: string, since: number): Promise<UserEvents> {
  const [matches, challenges] = await Promise.all([
    supabase
      .from('matches')
      .select('player_a_id,player_b_id,submitted_by,confirmed_by,confirmed_at')
      .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
      .in('status', ['CONFIRMED', 'FORFEIT']),
    supabase.from('challenges').select('id,challenger_id,opponent_id,type,created_at').or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`),
  ]);
  const verifiedSince: UserEvents['verifiedSince'] = [];
  let confirmedSince = 0;
  for (const m of ((matches.data ?? []) as { player_a_id: string; player_b_id: string; submitted_by: string | null; confirmed_by: string | null; confirmed_at: string | null }[])) {
    const at = m.confirmed_at ? new Date(m.confirmed_at).getTime() : 0;
    if (at >= since) {
      verifiedSince.push({ at, opp: m.player_a_id === userId ? m.player_b_id : m.player_a_id });
      if (m.confirmed_by === userId) confirmedSince++;
    }
  }
  let challengedSince = 0;
  const rows = ((challenges.data ?? []) as RematchEvent[]);
  for (const c of rows) {
    if (new Date(c.created_at).getTime() < since) continue;
    if (c.challenger_id === userId) challengedSince++;
  }
  const rematchSince = rivalQuestQualifies(rows, userId) ? 1 : 0;
  return { verifiedSince, challengedSince, confirmedSince, rematchSince };
}

export async function questProgress(userId: string, quest: QuestDef): Promise<{ done: number; complete: boolean; claimed: boolean }> {
  const since = quest.kind === 'daily' ? dayStart() : weekStart();
  const period = periodFor(quest.kind);
  const [events, claim] = await Promise.all([
    getUserEvents(userId, since).catch(() => ({ verifiedSince: [], challengedSince: 0, confirmedSince: 0, rematchSince: 0 }) as UserEvents),
    supabase.from('quest_claims').select('id').eq('player_id', userId).eq('quest_key', quest.key).eq('period', period).maybeSingle(),
  ]);
  let done = 0;
  switch (quest.key) {
    case 'first-blood': done = Math.min(1, events.verifiedSince.length); break;
    case 'wanderer': done = Math.min(2, new Set(events.verifiedSince.map((v) => v.opp)).size); break;
    case 'caller': done = Math.min(1, events.challengedSince); break;
    case 'squire': done = Math.min(1, events.confirmedSince); break;
    case 'veteran': done = Math.min(3, events.verifiedSince.length); break;
    case 'rival': done = Math.min(1, events.rematchSince); break;
  }
  return { done, complete: done >= quest.target, claimed: !!claim.data };
}

export async function claimQuest(userId: string, quest: QuestDef): Promise<void> {
  const p = await questProgress(userId, quest);
  if (!p.complete) throw new Error('Quest not complete yet.');
  if (p.claimed) throw new Error('Already claimed.');
  // Server re-validates progress + inserts claim + XP (0034 claim_quest RPC).
  const { error } = await supabase.rpc('claim_quest', { p_quest_key: quest.key });
  if (error) throw new Error(error.message);
}

export const sagaService = {
  LEVELS, levelFor, currentSeason, awardXP, getTotalXP, getSeasonBoard,
  QUESTS, periodFor, questProgress, claimQuest, rivalQuestQualifies,
  askGift, listIncomingGifts, listOutgoingGifts, answerGift,
  client: supabase,
};

// ---- GP gifts: ask a member for Glory as a favor ----

export interface GiftRequest {
  id: string;
  requester_id: string;
  giver_id: string;
  amount: number;
  message: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  created_at: string;
  requester?: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
  giver?: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
}

const GIFT_WITH = '*,requester:profiles!gp_requests_requester_id_fkey(id,username,display_name,avatar_url),giver:profiles!gp_requests_giver_id_fkey(id,username,display_name,avatar_url)';

export async function askGift(giverId: string, requesterId: string, amount: number, message?: string | null): Promise<void> {
  if (giverId === requesterId) throw new Error('You cannot ask yourself.');
  if (!Number.isInteger(amount) || amount < 5 || amount > 500) throw new Error('Ask between 5 and 500 GP.');
  const { error } = await supabase.from('gp_requests').insert({
    requester_id: requesterId,
    giver_id: giverId,
    amount,
    message: message?.trim() || null,
  });
  if (error) throw new Error(error.message);
  await notify(giverId, 'COMPETITION_INVITATION', 'Glory requested', `A brother asks you for ${amount} GP as a favor.`);
}

export async function listIncomingGifts(giverId: string): Promise<GiftRequest[]> {
  const { data, error } = await supabase
    .from('gp_requests')
    .select(GIFT_WITH)
    .eq('giver_id', giverId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GiftRequest[];
}

export async function listOutgoingGifts(requesterId: string): Promise<GiftRequest[]> {
  const { data, error } = await supabase
    .from('gp_requests')
    .select(GIFT_WITH)
    .eq('requester_id', requesterId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as GiftRequest[];
}

export async function answerGift(req: GiftRequest, accept: boolean): Promise<void> {
  if (req.status !== 'PENDING') throw new Error('Already answered.');
  // Server checks giver balance + moves the paired ledger rows (0034 answer_gift RPC).
  const { error } = await supabase.rpc('answer_gift', { p_request_id: req.id, p_accept: accept });
  if (error) throw new Error(error.message);
}
