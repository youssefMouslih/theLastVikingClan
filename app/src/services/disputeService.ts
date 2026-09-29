import { supabase } from '../lib/supabase';
import { adminSetResult, awardForfeit } from './matchService';

export interface DisputeRow {
  id: string;
  match_id: string;
  created_by: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  match?: { id: string; competition_id: string; player_a_id: string; player_b_id: string; score_a: number | null; score_b: number | null; status: string } | null;
  reporter?: { username: string; display_name: string | null } | null;
}

// Admin dispute queue (§41-43). Every decision is audit-logged (§73).
export async function listDisputes(openOnly = true): Promise<DisputeRow[]> {
  let q = supabase
    .from('disputes')
    .select('id,match_id,created_by,reason,description,status,created_at,match:matches(id,competition_id,player_a_id,player_b_id,score_a,score_b,status)')
    .order('created_at', { ascending: false });
  if (openOnly) q = q.in('status', ['OPEN', 'UNDER_REVIEW']);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as DisputeRow[];
  // Reporter names in a second query (avoids FK-name assumptions).
  const ids = [...new Set(rows.map((r) => r.created_by))];
  if (ids.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id,username,display_name').in('id', ids);
    const map = new Map(((profs ?? []) as { id: string; username: string; display_name: string | null }[]).map((p) => [p.id, p]));
    for (const r of rows) {
      const p = map.get(r.created_by);
      if (p) r.reporter = { username: p.username, display_name: p.display_name };
    }
  }
  return rows;
}

export type ResolveAction = 'confirm_submitted' | 'set_result' | 'forfeit_a' | 'forfeit_b' | 'reject';

export async function resolveDispute(
  dispute: DisputeRow,
  adminId: string,
  action: ResolveAction,
  scoreA?: number,
  scoreB?: number,
  note?: string,
) {
  const m = dispute.match;
  if (!m) throw new Error('Match not found for this dispute.');
  // mark under review first
  await supabase.from('disputes').update({ status: 'UNDER_REVIEW' }).eq('id', dispute.id);

  if (action === 'reject') {
    await supabase.from('matches').update({ status: 'RESULT_SUBMITTED', updated_at: new Date().toISOString() }).eq('id', m.id);
    await supabase.from('disputes').update({ status: 'REJECTED', resolved_by: adminId, resolution: note ?? 'Rejected', resolved_at: new Date().toISOString() }).eq('id', dispute.id);
  } else if (action === 'confirm_submitted') {
    if (m.score_a == null || m.score_b == null) throw new Error('No submitted score to confirm.');
    await adminSetResult(m.id, m.score_a, m.score_b, adminId, m.competition_id, m.player_a_id, m.player_b_id);
    await supabase.from('disputes').update({ status: 'RESOLVED', resolved_by: adminId, resolution: note ?? `Confirmed ${m.score_a}–${m.score_b}`, resolved_at: new Date().toISOString() }).eq('id', dispute.id);
  } else if (action === 'set_result') {
    if (scoreA == null || scoreB == null) throw new Error('Scores required.');
    await adminSetResult(m.id, scoreA, scoreB, adminId, m.competition_id, m.player_a_id, m.player_b_id);
    await supabase.from('disputes').update({ status: 'RESOLVED', resolved_by: adminId, resolution: note ?? `Set to ${scoreA}–${scoreB}`, resolved_at: new Date().toISOString() }).eq('id', dispute.id);
  } else if (action === 'forfeit_a') {
    await awardForfeit(m.id, m.player_a_id, m.player_b_id, adminId);
    await supabase.from('disputes').update({ status: 'RESOLVED', resolved_by: adminId, resolution: note ?? 'Forfeit to A 3–0', resolved_at: new Date().toISOString() }).eq('id', dispute.id);
  } else {
    await awardForfeit(m.id, m.player_b_id, m.player_a_id, adminId);
    await supabase.from('disputes').update({ status: 'RESOLVED', resolved_by: adminId, resolution: note ?? 'Forfeit to B 3–0', resolved_at: new Date().toISOString() }).eq('id', dispute.id);
  }
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_RESOLVED_DISPUTE', entity_type: 'dispute', entity_id: dispute.id, new_data: { action, scoreA, scoreB }, reason: note ?? null });
}

export const disputeService = { listDisputes, resolveDispute, client: supabase };
