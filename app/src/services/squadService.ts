import { supabase } from '../lib/supabase';
import { notify } from './notificationService';

export interface Squad {
  id: string;
  name: string;
  size: 3 | 4;
  leader_id: string;
  opponent_label: string | null;
  match_at: string | null;
  status: string;
}

export interface SquadMemberRow {
  id: string;
  squad_id: string;
  player_id: string;
  role: string;
  status: string;
  player?: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null;
}

export interface SquadDetail extends Squad {
  members: SquadMemberRow[];
}

export async function listSquads(): Promise<SquadDetail[]> {
  const { data, error } = await supabase
    .from('squads')
    .select('*,members:squad_members(*,player:profiles!squad_members_player_id_fkey(id,username,display_name,avatar_url))')
    .neq('status', 'DISBANDED')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as SquadDetail[]).map((s) => ({
    ...s,
    members: [...(s.members ?? [])].sort((a, b) => (a.role === 'LEADER' ? -1 : b.role === 'LEADER' ? 1 : 0)),
  }));
}

export async function createSquad(input: { name: string; size: 3 | 4; inviteIds: string[]; opponent_label?: string | null; match_at?: string | null }, leaderId: string): Promise<string> {
  if (!input.name.trim()) throw new Error('Squad needs a name.');
  if (input.inviteIds.length > input.size - 1) throw new Error(`A ${input.size}v${input.size} squad holds ${input.size - 1} invited warriors plus you.`);
  const { data, error } = await supabase
    .from('squads')
    .insert({ name: input.name.trim(), size: input.size, leader_id: leaderId, opponent_label: input.opponent_label?.trim() || null, match_at: input.match_at || null })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const squadId = (data as { id: string }).id;
  const rows = [
    { squad_id: squadId, player_id: leaderId, role: 'LEADER', status: 'ACCEPTED' },
    ...input.inviteIds.filter((id) => id !== leaderId).map((id) => ({ squad_id: squadId, player_id: id, role: 'MEMBER', status: 'PENDING' })),
  ];
  const { error: mErr } = await supabase.from('squad_members').insert(rows);
  if (mErr) throw new Error(mErr.message);
  for (const id of input.inviteIds.filter((pid) => pid !== leaderId)) {
    await notify(id, 'COMPETITION_INVITATION', `War Council: ${input.name.trim()}`, 'A squad leader calls you to battle. Accept or decline.');
  }
  return squadId;
}

export async function requestToJoin(squadId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from('squad_members').insert({ squad_id: squadId, player_id: playerId, role: 'MEMBER', status: 'PENDING' });
  if (error) {
    if (error.message.includes('duplicate')) throw new Error('Already in this squad.');
    throw new Error(error.message);
  }
  const { data: squad } = await supabase.from('squads').select('leader_id').eq('id', squadId).single();
  const leader = (squad as { leader_id: string } | null)?.leader_id;
  if (leader && leader !== playerId) await notify(leader, 'COMPETITION_INVITATION', 'Squad request', 'A warrior requests to join your squad.');
}

export async function answerSquadMember(memberId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.from('squad_members').update({ status: accept ? 'ACCEPTED' : 'DECLINED' }).eq('id', memberId);
  if (error) throw new Error(error.message);
}

export async function disbandSquad(squadId: string): Promise<void> {
  const { error } = await supabase.from('squads').update({ status: 'DISBANDED' }).eq('id', squadId);
  if (error) throw new Error(error.message);
}

export const squadService = { listSquads, createSquad, requestToJoin, answerSquadMember, disbandSquad, client: supabase };
