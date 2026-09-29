import { supabase } from '../lib/supabase';

// Honours (§63 records, §64 Hall of Fame, §118 season MVP — manual in V1).
// Awarding a title here feeds PlayerPage titles + clan records.
export type HonourType = 'LEAGUE_CHAMPION' | 'CUP_CHAMPION' | 'TOURNAMENT_CHAMPION' | 'SEASON_MVP' | 'SPECIAL';

export interface Honour {
  id: string;
  player_id: string;
  competition_id: string | null;
  type: string;
  name: string;
  description: string | null;
  awarded_at: string;
}

export async function listRecentHonours(limit = 30): Promise<Honour[]> {
  const { data, error } = await supabase.from('achievements').select('*').order('awarded_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Honour[];
}

export async function awardHonour(
  input: { player_id: string; competition_id?: string | null; type: HonourType; name: string; description?: string | null },
  adminId: string,
): Promise<void> {
  const { error } = await supabase.from('achievements').insert({
    player_id: input.player_id,
    competition_id: input.competition_id ?? null,
    type: input.type,
    name: input.name.trim(),
    description: input.description ?? null,
  });
  if (error) throw new Error(error.message);
  await supabase.from('audit_logs').insert({
    actor_id: adminId,
    action: 'ADMIN_AWARDED_HONOUR',
    entity_type: 'player',
    entity_id: input.player_id,
    new_data: { type: input.type, name: input.name },
  });
}

export async function deleteHonour(id: string) {
  const { error } = await supabase.from('achievements').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export const honourService = { listRecentHonours, awardHonour, deleteHonour, client: supabase };
