import { supabase } from '../lib/supabase';
import type { ThroneReign } from '../types/database';

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
  return 'transfer';
}

export const throneService = { getCurrentReign, getReignHistory, crownHolder, vacateThrone, settleThroneBattle, client: supabase };
