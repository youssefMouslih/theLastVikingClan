import { validateReplacement } from '../competition/replacementEngine';
import { supabase } from '../lib/supabase';
import { notify } from './notificationService';

// Player replacement (§46-51): future SCHEDULED fixtures transfer to the new
// player; CONFIRMED/history stays untouched; clan membership untouched (§51).
export async function replacePlayer(args: {
  competitionId: string;
  originalId: string;
  replacementId: string;
  reason: string;
  adminId: string;
}): Promise<{ transferred: number }> {
  const { data: comp } = await supabase.from('competitions').select('id,status').eq('id', args.competitionId).single();
  const status = (comp as { status: string } | null)?.status;
  if (!comp) throw new Error('Competition not found.');
  if (status === 'FINISHED' || status === 'ARCHIVED') throw new Error('Cannot replace players in a finished competition.');

  const [{ data: parts }, { data: repProfile }] = await Promise.all([
    supabase.from('competition_participants').select('player_id').eq('competition_id', args.competitionId),
    supabase.from('profiles').select('id,status').eq('id', args.replacementId).maybeSingle(),
  ]);
  const ids = ((parts ?? []) as { player_id: string }[]).map((p) => p.player_id);
  const rep = repProfile as { status: string } | null;
  const v = validateReplacement({
    originalPlayerId: args.originalId,
    replacementPlayerId: args.replacementId,
    participantPlayerIds: ids,
    isReplacementClanMember: !!rep,
    isReplacementActive: rep?.status === 'ACTIVE',
  });
  if (!v.ok) throw new Error(v.error ?? 'Invalid replacement.');

  const now = new Date().toISOString();
  // 1. mark original REPLACED (history preserved)
  const { error: markErr } = await supabase
    .from('competition_participants')
    .update({ status: 'REPLACED', left_at: now, updated_at: now })
    .eq('competition_id', args.competitionId)
    .eq('player_id', args.originalId);
  if (markErr) throw new Error(markErr.message);
  // 2. register replacement with lineage (§50)
  const { error: insErr } = await supabase.from('competition_participants').insert({
    competition_id: args.competitionId,
    player_id: args.replacementId,
    status: 'REGISTERED',
    replacement_for: args.originalId,
    replacement_date: now,
    replacement_reason: args.reason,
  });
  if (insErr) throw new Error(insErr.message);
  // 3. transfer future SCHEDULED fixtures only
  const { data: future } = await supabase
    .from('matches')
    .select('id,player_a_id,player_b_id')
    .eq('competition_id', args.competitionId)
    .eq('status', 'SCHEDULED')
    .or(`player_a_id.eq.${args.originalId},player_b_id.eq.${args.originalId}`);
  let transferred = 0;
  for (const fx of (future ?? []) as { id: string; player_a_id: string; player_b_id: string }[]) {
    const patch = fx.player_a_id === args.originalId ? { player_a_id: args.replacementId } : { player_b_id: args.replacementId };
    const { error } = await supabase.from('matches').update({ ...patch, updated_at: now }).eq('id', fx.id);
    if (!error) transferred++;
  }
  await supabase.from('audit_logs').insert({
    actor_id: args.adminId,
    action: 'ADMIN_REPLACED_PLAYER',
    entity_type: 'competition',
    entity_id: args.competitionId,
    old_data: { originalId: args.originalId },
    new_data: { replacementId: args.replacementId, transferred },
    reason: args.reason,
  });
  await notify(args.replacementId, 'PLAYER_REPLACED', 'You joined a competition', `You replaced a player. ${transferred} upcoming fixtures are now yours.`, { type: 'competition', id: args.competitionId });
  await notify(args.originalId, 'PLAYER_REPLACED', 'You were replaced', `Reason: ${args.reason}. Your past results are preserved.`, { type: 'competition', id: args.competitionId });
  return { transferred };
}

export async function listReplacements(competitionId: string) {
  const { data, error } = await supabase
    .from('competition_participants')
    .select('player_id,replacement_for,replacement_date,replacement_reason')
    .eq('competition_id', competitionId)
    .not('replacement_for', 'is', null);
  if (error) throw new Error(error.message);
  return (data ?? []) as { player_id: string; replacement_for: string; replacement_date: string; replacement_reason: string | null }[];
}

export const replacementService = { replacePlayer, listReplacements, client: supabase };
