import { supabase } from '../lib/supabase';
import type { ThroneReign } from '../types/database';
import { notify } from './notificationService';

const WITH_HOLDER = '*,holder:profiles!throne_reigns_holder_id_fkey(id,username,display_name,avatar_url)';

// Current champion = open reign (ended_at IS NULL).
export async function getCurrentReign(): Promise<(ThroneReign & { holder: NonNullable<ThroneReign['holder']> }) | null> {
  const { data, error } = await supabase
    .from('throne_reigns')
    .select(WITH_HOLDER)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ThroneReign & { holder: NonNullable<ThroneReign['holder']> }) ?? null;
}

export async function getReignHistory(limit = 10): Promise<ThroneReign[]> {
  const { data, error } = await supabase
    .from('throne_reigns')
    .select(WITH_HOLDER)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ThroneReign[];
}

// Admin crowns a holder (starts new reign, ends the previous one).
export async function crownHolder(holderId: string, adminId: string, competitionId?: string | null): Promise<void> {
  const current = await getCurrentReign().catch(() => null);
  const now = new Date().toISOString();
  if (current && current.holder_id !== holderId) {
    const { error } = await supabase.from('throne_reigns').update({ ended_at: now }).eq('id', current.id);
    if (error) throw new Error(error.message);
  }
  if (!current || current.holder_id !== holderId) {
    const { error } = await supabase.from('throne_reigns').insert({
      holder_id: holderId,
      won_from: current?.holder_id ?? null,
      competition_id: competitionId ?? null,
      created_by: adminId,
    });
    if (error) throw new Error(error.message);
  }
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_CROWNED_CHAMPION', entity_type: 'player', entity_id: holderId });
}

export async function vacateThrone(adminId: string): Promise<void> {
  const current = await getCurrentReign();
  if (!current) return;
  const { error } = await supabase.from('throne_reigns').update({ ended_at: new Date().toISOString() }).eq('id', current.id);
  if (error) throw new Error(error.message);
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_VACATED_THRONE', entity_type: 'player', entity_id: current.holder_id });
}

// Called when a throne battle completes: holder win = defense+1,
// challenger win = the throne changes hands.
// @deprecated since 0034: RLS denies these direct writes for non-staff.
// confirmBattleResult now calls the settle_throne_battle RPC instead.
// Kept for staff-side compat only.
export async function settleThroneBattle(args: {
  holderId: string;
  challengerId: string;
  winnerId: string | null;
}): Promise<'defended' | 'transfer' | 'draw'> {
  const current = await getCurrentReign().catch(() => null);
  if (!current || current.holder_id !== args.holderId) return 'draw';
  if (!args.winnerId || args.winnerId === args.holderId) {
    const { error } = await supabase.from('throne_reigns').update({ defenses: current.defenses + 1 }).eq('id', current.id);
    if (error) throw new Error(error.message);
    return args.winnerId ? 'defended' : 'draw';
  }
  const now = new Date().toISOString();
  const { error: endErr } = await supabase.from('throne_reigns').update({ ended_at: now }).eq('id', current.id);
  if (endErr) throw new Error(endErr.message);
  const { error: newErr } = await supabase.from('throne_reigns').insert({ holder_id: args.challengerId, won_from: args.holderId });
  if (newErr) throw new Error(newErr.message);
  // Pledges follow the throne, not the holder: other PENDING/ACCEPTED throne
  // pledges vs the old champion move onto the new one. ACCEPTED ones drop back
  // to PENDING so the new holder answers them. RESULT_SUBMITTED ones already
  // carry a score earned against the old holder — leave them; they settle dead.
  try {
    const { data: stale } = await supabase
      .from('challenges')
      .select('id,challenger_id')
      .eq('for_throne', true)
      .eq('opponent_id', args.holderId)
      .in('status', ['PENDING', 'ACCEPTED']);
    const others = ((stale ?? []) as { id: string; challenger_id: string }[])
      .filter((s) => s.challenger_id !== args.challengerId);
    for (const s of others) {
      await supabase
        .from('challenges')
        .update({ opponent_id: args.challengerId, status: 'PENDING', responded_at: null, updated_at: now })
        .eq('id', s.id);
      await notify(s.challenger_id, 'COMPETITION_INVITATION', 'Pledge redirected', 'The throne changed hands — your challenge now targets the new champion.', { type: 'battle', id: s.id });
    }
    if (others.length > 0) {
      await notify(args.challengerId, 'COMPETITION_INVITATION', 'Throne pledges incoming', 'Redirected challenges await your answer as the new champion.');
    }
  } catch { /* retarget never breaks the transfer */ }
  return 'transfer';
}

export const throneService = { getCurrentReign, getReignHistory, crownHolder, vacateThrone, settleThroneBattle, client: supabase };
