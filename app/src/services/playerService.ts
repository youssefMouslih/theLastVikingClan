import { supabase } from '../lib/supabase';
import type { MemberStatus, Profile, Role } from '../types/database';

// Clan member queries (§12-13). Only ACTIVE members join new competitions (Rule 2).
export async function listMembers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('role', { ascending: true })
    .order('username', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export async function listActiveMembers(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('*').eq('status', 'ACTIVE').order('username');
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export async function getMember(id: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
  if (error) return null;
  return data as Profile;
}

export type OwnProfilePatch = Partial<Pick<Profile,
  'display_name' | 'efootball_name' | 'efootball_id' | 'bio' | 'country' | 'avatar_url' |
  'division_pvp' | 'division_ai' | 'fav_player_name' | 'fav_player_rating' | 'fav_player_position' |
  'banner_color' | 'banner_image' | 'instagram' | 'tiktok' | 'kick' | 'whatsapp' | 'known_name'
>>;

export async function updateOwnProfile(userId: string, patch: OwnProfilePatch) {
  const { error } = await supabase.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', userId);
  if (error) throw new Error(humanTagError(error.message));
}

// Warrior tags are unique (migration 0023, case-insensitive). Check before
// save so the user gets a friendly message instead of a DB error.
export async function isKnownNameTaken(tag: string, excludeId?: string): Promise<boolean> {
  const clean = tag.trim().toLowerCase();
  if (!clean) return false;
  const escaped = tag.trim().replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data, error } = await supabase.from('profiles').select('id,known_name').ilike('known_name', escaped);
  if (error) return false; // fail open: DB constraint is the final guard
  return ((data ?? []) as { id: string; known_name: string | null }[]).some(
    (r) => r.known_name?.trim().toLowerCase() === clean && r.id !== excludeId,
  );
}

function humanTagError(msg: string): string {
  if (/profiles_known_name_unique/i.test(msg) || (/duplicate key/i.test(msg) && /known_name/i.test(msg))) {
    return 'That warrior tag is already taken — choose another.';
  }
  return msg;
}

// Admin-only (RLS enforces OWNER/ADMIN). Audit log written by caller.
export async function adminSetRole(userId: string, role: Role) {
  const { error } = await supabase.from('profiles').update({ role, updated_at: new Date().toISOString() }).eq('id', userId);
  if (error) throw new Error(error.message);
}

export async function adminSetStatus(userId: string, status: MemberStatus) {
  const { error } = await supabase.from('profiles').update({ status, updated_at: new Date().toISOString() }).eq('id', userId);
  if (error) throw new Error(error.message);
}

// Owner-managed permissions (§10 roles):
// - OWNER/ADMIN can set PLAYER/MODERATOR roles and ACTIVE/INACTIVE/SUSPENDED status.
// - Only OWNER can grant/revoke ADMIN or OWNER, touch an ADMIN/OWNER member,
//   or REMOVE someone. Nobody can change their own role/status.
export async function manageMember(args: {
  target: Profile;
  role: Role;
  status: MemberStatus;
  actorId: string;
  actorRole: Role;
}): Promise<void> {
  const { target, role, status, actorId, actorRole } = args;
  if (target.id === actorId) throw new Error('You cannot change your own role or status.');
  const sensitiveTarget = target.role === 'OWNER' || target.role === 'ADMIN';
  const sensitiveGrant = role === 'OWNER' || role === 'ADMIN';
  if ((sensitiveTarget || sensitiveGrant || status === 'REMOVED') && actorRole !== 'OWNER') {
    throw new Error('Only the owner can assign Admin/Owner roles or remove members.');
  }
  if (target.role === 'OWNER' && role !== 'OWNER') {
    // Never leave the clan without an owner: require another owner first.
    const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'OWNER').eq('status', 'ACTIVE');
    if ((count ?? 0) <= 1) throw new Error('Transfer ownership first — the clan must keep at least one active owner.');
  }
  const { error } = await supabase
    .from('profiles')
    .update({ role, status, updated_at: new Date().toISOString() })
    .eq('id', target.id);
  if (error) throw new Error(error.message);
  // Best-effort audit: never block the change if the audit table/RLS is missing.
  try {
    await supabase.from('audit_logs').insert({
      actor_id: actorId,
      action: 'ADMIN_MANAGED_MEMBER',
      entity_type: 'player',
      entity_id: target.id,
      old_data: { role: target.role, status: target.status },
      new_data: { role, status },
    });
  } catch (e) {
    console.warn('audit skipped:', e instanceof Error ? e.message : e);
  }
}

export const playerService = {
  listMembers,
  listActiveMembers,
  getMember,
  updateOwnProfile,
  isKnownNameTaken,
  adminSetRole,
  adminSetStatus,
  manageMember,
  client: supabase,
};
