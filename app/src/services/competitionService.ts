import { registrationState } from '../competition/deadlineEngine';
import { generateJoinCode } from '../competition/joinCode';
import { supabase } from '../lib/supabase';
import type { Competition, CompetitionType } from '../types/database';

export { generateJoinCode };

export interface CreateCompetitionInput {
  name: string;
  description?: string | null;
  type: CompetitionType;
  min_players: number;
  max_players: number;
  registration_start?: string | null;
  registration_deadline: string | null;
  start_date?: string | null;
  end_date?: string | null;
  match_deadline_hours: number;
  format?: string | null;
}

// Join codes live in ../competition/joinCode (pure, unit-tested).

export async function listCompetitions(includeDeleted = false): Promise<Competition[]> {
  const run = async (filtered: boolean) => {
    let q = supabase.from('competitions').select('*').order('created_at', { ascending: false });
    if (filtered && !includeDeleted) q = q.eq('is_deleted', false);
    return q;
  };
  let { data, error } = await run(true);
  if (error?.message?.includes('is_deleted')) {
    // Pre-0003 database: column doesn't exist yet — fall back to unfiltered.
    console.warn('Run migration 0003_soft_delete.sql for soft-delete support.');
    ({ data, error } = await run(false));
  }
  if (error) throw new Error(error.message);
  return (data ?? []) as Competition[];
}

export async function getCompetition(id: string, includeDeleted = false): Promise<Competition | null> {
  const run = async (filtered: boolean) => {
    let q = supabase.from('competitions').select('*').eq('id', id);
    if (filtered && !includeDeleted) q = q.eq('is_deleted', false);
    return q.single();
  };
  let { data, error } = await run(true);
  if (error?.message?.includes('is_deleted')) {
    console.warn('Run migration 0003_soft_delete.sql for soft-delete support.');
    ({ data, error } = await run(false));
  }
  if (error) return null;
  return data as Competition;
}

export async function getCompetitionByCode(code: string): Promise<Competition | null> {
  const run = async (filtered: boolean) => {
    let q = supabase.from('competitions').select('*').eq('join_code', code.trim().toUpperCase());
    if (filtered) q = q.eq('is_deleted', false);
    return q.maybeSingle();
  };
  let { data, error } = await run(true);
  if (error?.message?.includes('is_deleted')) {
    console.warn('Run migration 0003_soft_delete.sql for soft-delete support.');
    ({ data, error } = await run(false));
  }
  if (error) return null;
  return (data as Competition | null) ?? null;
}

export async function createCompetition(input: CreateCompetitionInput, createdBy: string): Promise<Competition> {
  if (input.max_players < input.min_players) throw new Error('Maximum players must be >= minimum players.');
  if (input.max_players > 32) throw new Error('V1 supports max 32 players.');
  const now = new Date().toISOString();
  const status = input.registration_start && new Date(input.registration_start).getTime() > Date.now() ? 'DRAFT' : 'REGISTRATION_OPEN';
  const { data, error } = await supabase
    .from('competitions')
    .insert({
      name: input.name.trim(),
      description: input.description ?? null,
      type: input.type,
      status,
      min_players: input.min_players,
      max_players: input.max_players,
      registration_start: input.registration_start ?? now,
      registration_deadline: input.registration_deadline,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      match_deadline_hours: input.match_deadline_hours,
      join_code: generateJoinCode(),
      join_enabled: true,
      format: input.format ?? (input.type === 'LEAGUE' ? 'Round Robin' : 'Knockout'),
      created_by: createdBy,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Competition;
}

export interface ParticipantRow {
  id: string;
  competition_id: string;
  player_id: string;
  status: string;
  joined_at: string;
  player?: { id: string; username: string; display_name: string | null } | null;
}

export async function listParticipants(competitionId: string): Promise<ParticipantRow[]> {
  const { data, error } = await supabase
    .from('competition_participants')
    .select('id,competition_id,player_id,status,joined_at,player:profiles(id,username,display_name)')
    .eq('competition_id', competitionId)
    .order('joined_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ParticipantRow[];
}

// Join flow (§22 validation 1-7 + §101). NOTE: V1 checks run client-side;
// harden with an Edge Function for atomic capacity checks (§100) before public launch.
export async function joinCompetition(comp: Competition, userId: string): Promise<void> {
  // 2. must be ACTIVE clan member
  const { data: profile } = await supabase.from('profiles').select('status').eq('id', userId).maybeSingle();
  if (!profile || (profile as { status: string }).status !== 'ACTIVE') {
    throw new Error('Only ACTIVE clan members can join competitions (Rule 2).');
  }
  // 4. registration open
  const { count } = await supabase.from('competition_participants').select('id', { count: 'exact', head: true }).eq('competition_id', comp.id);
  const state = registrationState(Date.now(), comp.registration_start, comp.registration_deadline, count ?? 0, comp.max_players);
  if (!comp.join_enabled || comp.status !== 'REGISTRATION_OPEN' || state === 'CLOSED' || state === 'NOT_OPEN') {
    throw new Error('Registration is closed for this competition.');
  }
  if (state === 'FULL') {
    const err = new Error('This competition is full (16 / 16). You can join the waitlist.');
    (err as Error & { code?: string }).code = 'COMPETITION_FULL';
    throw err;
  }
  // 6. insert (unique constraint backs Rule 3)
  const { error } = await supabase.from('competition_participants').insert({ competition_id: comp.id, player_id: userId });
  if (error) {
    if (error.message.includes('duplicate')) throw new Error('You are already registered for this competition.');
    throw new Error(error.message);
  }
}

export async function leaveCompetition(competitionId: string, userId: string) {
  const { error } = await supabase.from('competition_participants').delete().eq('competition_id', competitionId).eq('player_id', userId);
  if (error) throw new Error(error.message);
}

export async function joinWaitlist(competitionId: string, userId: string) {
  const { data } = await supabase.from('competition_waitlist').select('position').eq('competition_id', competitionId).order('position', { ascending: false }).limit(1);
  const next = ((data?.[0] as { position?: number } | undefined)?.position ?? 0) + 1;
  const { error } = await supabase.from('competition_waitlist').insert({ competition_id: competitionId, player_id: userId, position: next });
  if (error) {
    if (error.message.includes('duplicate')) throw new Error('You are already on the waitlist.');
    throw new Error(error.message);
  }
}

export async function setCompetitionStatus(id: string, status: Competition['status']) {
  const { error } = await supabase.from('competitions').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

// Reopen a closed registration. If the deadline already passed, it is
// extended +48h automatically (otherwise auto-close would flip it back
// on the next view) — admin can fine-tune it in Edit.
export async function reopenRegistration(comp: Competition): Promise<string> {
  const now = Date.now();
  const patch: Partial<Competition> = { status: 'REGISTRATION_OPEN', join_enabled: true };
  let note = 'Registration reopened.';
  if (comp.registration_deadline && now > new Date(comp.registration_deadline).getTime()) {
    patch.registration_deadline = new Date(now + 48 * 3600 * 1000).toISOString();
    note = 'Registration reopened; the deadline had passed so it was extended +48h. Adjust it in Edit if needed.';
  }
  const { error } = await supabase.from('competitions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', comp.id);
  if (error) throw new Error(error.message);
  return note;
}

// Edit (§113 locking): name/description always editable. Dates, capacity and
// points only before the competition starts; after that they need explicit
// override (UI confirms: "may affect existing matches and standings").
export type CompetitionEdit = Partial<Pick<
  Competition,
  'name' | 'description' | 'registration_start' | 'registration_deadline' |
  'start_date' | 'end_date' | 'min_players' | 'max_players' |
  'match_deadline_hours' | 'points_win' | 'points_draw' | 'points_loss' | 'format'
>>;

const LOCKED_AFTER_START: (keyof CompetitionEdit)[] = [
  'min_players', 'max_players', 'match_deadline_hours',
  'points_win', 'points_draw', 'points_loss', 'format', 'start_date',
];

export async function updateCompetition(comp: Competition, patch: CompetitionEdit, overrideLock = false): Promise<void> {
  const started = ['ACTIVE', 'FINISHED', 'ARCHIVED'].includes(comp.status);
  if (started && !overrideLock) {
    const blocked = LOCKED_AFTER_START.filter((k) => patch[k] !== undefined);
    if (blocked.length > 0) throw new Error(`Locked after start (§113): ${blocked.join(', ')}. Confirm override to change.`);
  }
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('Name is required.');
  if (patch.min_players !== undefined && patch.max_players !== undefined && patch.max_players < patch.min_players) {
    throw new Error('Maximum players must be >= minimum players.');
  }
  const { error } = await supabase.from('competitions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', comp.id);
  if (error) throw new Error(error.message);
}

export async function hasMatches(competitionId: string): Promise<boolean> {
  const { count } = await supabase.from('matches').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId);
  return (count ?? 0) > 0;
}

// Deletion is always SOFT (flagged, hidden from players, kept in DB).
// - Not started (no fixtures): single admin deletes immediately.
// - Started (fixtures exist): two-person rule — one admin requests, a
//   DIFFERENT admin approves. Requester can never approve their own.
export async function softDeleteCompetition(id: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('competitions')
    .update({ is_deleted: true, delete_requested_by: adminId, delete_requested_at: new Date().toISOString(), delete_approved_by: adminId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_DELETED_COMPETITION', entity_type: 'competition', entity_id: id });
}

export async function requestDeletion(id: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('competitions')
    .update({ delete_requested_by: adminId, delete_requested_at: new Date().toISOString(), delete_approved_by: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_REQUESTED_DELETION', entity_type: 'competition', entity_id: id });
}

export async function approveDeletion(comp: Competition, adminId: string): Promise<void> {
  if (!comp.delete_requested_by) throw new Error('No pending deletion request.');
  if (comp.delete_requested_by === adminId) throw new Error('A different admin must approve — you requested this deletion.');
  const { error } = await supabase
    .from('competitions')
    .update({ is_deleted: true, delete_approved_by: adminId, updated_at: new Date().toISOString() })
    .eq('id', comp.id);
  if (error) throw new Error(error.message);
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_APPROVED_DELETION', entity_type: 'competition', entity_id: comp.id });
}

export async function rejectDeletion(id: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('competitions')
    .update({ delete_requested_by: null, delete_requested_at: null, delete_approved_by: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_REJECTED_DELETION', entity_type: 'competition', entity_id: id });
}

export async function restoreCompetition(id: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('competitions')
    .update({ is_deleted: false, delete_requested_by: null, delete_requested_at: null, delete_approved_by: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  await supabase.from('audit_logs').insert({ actor_id: adminId, action: 'ADMIN_RESTORED_COMPETITION', entity_type: 'competition', entity_id: id });
}

// Kept for backwards-compat; now soft. Prefer the flow above.
export async function deleteCompetition(id: string, adminId: string): Promise<void> {
  return softDeleteCompetition(id, adminId);
}

// Automatic lifecycle (§26, §99): registration closes on deadline;
// finished competitions close on end date when nothing is unresolved.
export async function autoRefreshCompetition(comp: Competition): Promise<{ changed: boolean; needsReview: boolean }> {
  if (comp.is_deleted) return { changed: false, needsReview: false };
  const now = Date.now();
  if (comp.status === 'DRAFT' && comp.registration_start && now >= new Date(comp.registration_start).getTime()) {
    await setCompetitionStatus(comp.id, 'REGISTRATION_OPEN');
    return { changed: true, needsReview: false };
  }
  if (comp.status === 'REGISTRATION_OPEN' && comp.registration_deadline && now > new Date(comp.registration_deadline).getTime()) {
    await setCompetitionStatus(comp.id, 'REGISTRATION_CLOSED');
    return { changed: true, needsReview: false };
  }
  if (comp.status === 'ACTIVE' && comp.end_date && now > new Date(comp.end_date).getTime()) {
    const { count } = await supabase
      .from('matches')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', comp.id)
      .not('status', 'in', '(CONFIRMED,FORFEIT,CANCELLED)');
    if ((count ?? 0) === 0) {
      await setCompetitionStatus(comp.id, 'FINISHED');
      return { changed: true, needsReview: false };
    }
    return { changed: false, needsReview: true };
  }
  return { changed: false, needsReview: false };
}

export async function regenerateJoinCode(id: string): Promise<string> {
  const code = generateJoinCode();
  const { error } = await supabase.from('competitions').update({ join_code: code, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  return code;
}

export async function setJoinEnabled(id: string, enabled: boolean) {
  const { error } = await supabase.from('competitions').update({ join_enabled: enabled, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export const competitionService = {
  listCompetitions,
  getCompetition,
  getCompetitionByCode,
  createCompetition,
  listParticipants,
  joinCompetition,
  leaveCompetition,
  joinWaitlist,
  setCompetitionStatus,
  reopenRegistration,
  updateCompetition,
  deleteCompetition,
  softDeleteCompetition,
  hasMatches,
  requestDeletion,
  approveDeletion,
  rejectDeletion,
  restoreCompetition,
  autoRefreshCompetition,
  regenerateJoinCode,
  setJoinEnabled,
  generateJoinCode,
  client: supabase,
};
