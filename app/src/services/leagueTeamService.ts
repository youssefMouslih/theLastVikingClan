import { supabase } from '../lib/supabase';
import { deleteStoredFile, uploadLeagueTeamLogo } from './storageService';
import { listActiveMembers } from './playerService';
import type {
  LeagueInviteCandidate,
  LeagueInviteWithContext,
  LeagueMemberWithProfile,
  LeagueProfileRef,
  LeagueSeason,
  LeagueTeam,
  LeagueTeamInvite,
  LeagueTeamMember,
  LeagueTeamRef,
  LeagueTeamSummary,
} from '../types/league4v4';

const PROFILE_COLUMNS = 'id,username,display_name,avatar_url';

async function loadProfiles(ids: string[]): Promise<Map<string, LeagueProfileRef>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).in('id', unique);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as LeagueProfileRef[]).map((profile) => [profile.id, profile]));
}

export { loadProfiles as loadLeagueProfiles };

function withProfiles(
  members: LeagueTeamMember[],
  profiles: Map<string, LeagueProfileRef>,
): LeagueMemberWithProfile[] {
  return members.map((member) => ({ ...member, player: profiles.get(member.player_id) ?? null }));
}

export async function listLeagueTeamRefs(seasonId: string): Promise<LeagueTeamRef[]> {
  const { data, error } = await supabase
    .from('league_teams')
    .select('id,name,status,logo_path')
    .eq('season_id', seasonId)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeagueTeamRef[];
}

export async function listLeagueTeams(seasonId: string): Promise<LeagueTeamSummary[]> {
  const [teamsResult, membersResult] = await Promise.all([
    supabase
      .from('league_teams')
      .select('*')
      .eq('season_id', seasonId)
      .order('name', { ascending: true }),
    supabase
      .from('league_team_members')
      .select('*')
      .eq('season_id', seasonId)
      .eq('status', 'ACTIVE')
      .order('joined_at', { ascending: true }),
  ]);
  if (teamsResult.error) throw new Error(teamsResult.error.message);
  if (membersResult.error) throw new Error(membersResult.error.message);

  const teams = (teamsResult.data ?? []) as LeagueTeam[];
  const members = (membersResult.data ?? []) as LeagueTeamMember[];
  const profiles = await loadProfiles([...teams.map((team) => team.captain_id), ...members.map((member) => member.player_id)]);
  const membersByTeam = new Map<string, LeagueMemberWithProfile[]>();
  for (const member of withProfiles(members, profiles)) {
    const list = membersByTeam.get(member.team_id) ?? [];
    list.push(member);
    membersByTeam.set(member.team_id, list);
  }

  return teams.map((team) => {
    const teamMembers = membersByTeam.get(team.id) ?? [];
    return {
      ...team,
      captain_profile: profiles.get(team.captain_id) ?? null,
      member_count: teamMembers.length,
      members: teamMembers,
    };
  });
}

export async function getLeagueTeamSummary(teamId: string): Promise<LeagueTeamSummary | null> {
  const [teamResult, membersResult] = await Promise.all([
    supabase.from('league_teams').select('*').eq('id', teamId).maybeSingle(),
    supabase
      .from('league_team_members')
      .select('*')
      .eq('team_id', teamId)
      .eq('status', 'ACTIVE')
      .order('joined_at', { ascending: true }),
  ]);
  if (teamResult.error) throw new Error(teamResult.error.message);
  if (membersResult.error) throw new Error(membersResult.error.message);
  const team = teamResult.data as LeagueTeam | null;
  if (!team) return null;

  const members = (membersResult.data ?? []) as LeagueTeamMember[];
  const profiles = await loadProfiles([team.captain_id, ...members.map((member) => member.player_id)]);
  const teamMembers = withProfiles(members, profiles);
  return {
    ...team,
    captain_profile: profiles.get(team.captain_id) ?? null,
    member_count: teamMembers.length,
    members: teamMembers,
  };
}

export async function findMyLeagueTeam(seasonId: string, playerId: string): Promise<LeagueTeamSummary | null> {
  const { data, error } = await supabase
    .from('league_team_members')
    .select('team_id')
    .eq('season_id', seasonId)
    .eq('player_id', playerId)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (error) throw new Error(error.message);
  const teamId = (data as { team_id: string } | null)?.team_id;
  if (!teamId) return null;
  return getLeagueTeamSummary(teamId);
}

export async function listLeagueTeamMembers(teamId: string): Promise<LeagueMemberWithProfile[]> {
  const { data, error } = await supabase
    .from('league_team_members')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'ACTIVE')
    .order('joined_at', { ascending: true });
  if (error) throw new Error(error.message);
  const members = (data ?? []) as LeagueTeamMember[];
  const profiles = await loadProfiles(members.map((member) => member.player_id));
  return withProfiles(members, profiles);
}

export async function listIncomingLeagueInvites(playerId: string): Promise<LeagueInviteWithContext[]> {
  const { data, error } = await supabase
    .from('league_team_invites')
    .select('*')
    .eq('player_id', playerId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const invites = (data ?? []) as LeagueTeamInvite[];
  if (invites.length === 0) return [];

  const teamIds = [...new Set(invites.map((invite) => invite.team_id))];
  const seasonIds = [...new Set(invites.map((invite) => invite.season_id))];
  const [teamsResult, seasonsResult] = await Promise.all([
    supabase.from('league_teams').select('id,name,status,logo_path').in('id', teamIds),
    supabase.from('league_seasons').select('id,name,status').in('id', seasonIds),
  ]);
  if (teamsResult.error) throw new Error(teamsResult.error.message);
  if (seasonsResult.error) throw new Error(seasonsResult.error.message);
  const teams = new Map(((teamsResult.data ?? []) as LeagueTeamRef[]).map((team) => [team.id, team]));
  const seasons = new Map(
    ((seasonsResult.data ?? []) as Pick<LeagueSeason, 'id' | 'name' | 'status'>[]).map((season) => [season.id, season]),
  );

  return invites.map((invite) => ({
    ...invite,
    team: teams.get(invite.team_id) ?? null,
    season: seasons.get(invite.season_id) ?? null,
    player: null,
  }));
}

export async function listTeamLeagueInvites(teamId: string): Promise<LeagueInviteWithContext[]> {
  const { data, error } = await supabase
    .from('league_team_invites')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const invites = (data ?? []) as LeagueTeamInvite[];
  const profiles = await loadProfiles(invites.map((invite) => invite.player_id));
  return invites.map((invite) => ({
    ...invite,
    team: null,
    season: null,
    player: profiles.get(invite.player_id) ?? null,
  }));
}

export async function listLeagueInviteCandidates(
  seasonId: string,
  teamId: string,
  excludePlayerId?: string,
): Promise<LeagueInviteCandidate[]> {
  const [profiles, membersResult, teamsResult, invitesResult] = await Promise.all([
    listActiveMembers(),
    supabase
      .from('league_team_members')
      .select('player_id, team_id')
      .eq('season_id', seasonId)
      .eq('status', 'ACTIVE'),
    supabase
      .from('league_teams')
      .select('id, name')
      .eq('season_id', seasonId),
    supabase
      .from('league_team_invites')
      .select('id, player_id')
      .eq('team_id', teamId)
      .eq('status', 'PENDING'),
  ]);
  if (membersResult.error) throw new Error(membersResult.error.message);
  if (teamsResult.error) throw new Error(teamsResult.error.message);
  if (invitesResult.error) throw new Error(invitesResult.error.message);
  const teamNames = new Map(
    ((teamsResult.data ?? []) as { id: string; name: string }[]).map((team) => [team.id, team.name]),
  );
  const memberTeams = new Map(
    ((membersResult.data ?? []) as { player_id: string; team_id: string }[])
      .map((row) => [row.player_id, row.team_id]),
  );
  const pendingInvites = new Map(
    ((invitesResult.data ?? []) as { id: string; player_id: string }[])
      .map((row) => [row.player_id, row.id]),
  );
  const rank: Record<LeagueInviteCandidate['squad_status'], number> = { FREE: 0, INVITED: 1, IN_SQUAD: 2 };
  return profiles
    .filter((profile) => profile.id !== excludePlayerId && memberTeams.get(profile.id) !== teamId)
    .map((profile) => {
      const otherTeamId = memberTeams.get(profile.id);
      const inviteId = pendingInvites.get(profile.id) ?? null;
      const squadStatus: LeagueInviteCandidate['squad_status'] = otherTeamId
        ? 'IN_SQUAD'
        : inviteId ? 'INVITED' : 'FREE';
      return {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        squad_status: squadStatus,
        squad_name: otherTeamId ? teamNames.get(otherTeamId) ?? null : null,
        invite_id: otherTeamId ? null : inviteId,
      };
    })
    .sort((a, b) => rank[a.squad_status] - rank[b.squad_status]
      || (a.display_name ?? a.username).localeCompare(b.display_name ?? b.username));
}

export async function createLeagueTeam(seasonId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('league_create_team', {
    p_season_id: seasonId,
    p_name: name.trim(),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateLeagueTeam(teamId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('league_update_team', {
    p_team_id: teamId,
    p_name: name.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function setLeagueTeamBio(teamId: string, bio: string | null): Promise<void> {
  const { error } = await supabase.rpc('league_set_team_bio', {
    p_team_id: teamId,
    p_bio: bio?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function setLeagueTeamLogo(teamId: string, logoPath: string | null): Promise<void> {
  const { error } = await supabase.rpc('league_set_team_logo', {
    p_team_id: teamId,
    p_logo_path: logoPath,
  });
  if (error) throw new Error(error.message);
}

export async function saveLeagueTeamLogo(
  teamId: string,
  file: File,
  previousPath: string | null,
): Promise<string> {
  const path = await uploadLeagueTeamLogo(file, teamId);
  try {
    await setLeagueTeamLogo(teamId, path);
  } catch (error) {
    await deleteStoredFile('league-assets', path);
    throw error;
  }
  if (previousPath && previousPath !== path) {
    await deleteStoredFile('league-assets', previousPath);
  }
  return path;
}

export async function clearLeagueTeamLogo(teamId: string, previousPath: string | null): Promise<void> {
  await setLeagueTeamLogo(teamId, null);
  if (previousPath) await deleteStoredFile('league-assets', previousPath);
}

export async function inviteLeagueMember(teamId: string, playerId: string, message?: string | null): Promise<void> {
  const { error } = await supabase.rpc('league_invite_member', {
    p_team_id: teamId,
    p_player_id: playerId,
    p_message: message?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function answerLeagueInvite(inviteId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('league_answer_invite', {
    p_invite_id: inviteId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message);
}

export async function revokeLeagueInvite(inviteId: string): Promise<void> {
  const { error } = await supabase.rpc('league_revoke_invite', { p_invite_id: inviteId });
  if (error) throw new Error(error.message);
}

export async function leaveLeagueTeam(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('league_leave_team', { p_team_id: teamId });
  if (error) throw new Error(error.message);
}

export async function removeLeagueTeamMember(teamId: string, playerId: string): Promise<void> {
  const { error } = await supabase.rpc('league_remove_member', {
    p_team_id: teamId,
    p_player_id: playerId,
  });
  if (error) throw new Error(error.message);
}

export async function transferLeagueCaptain(teamId: string, newCaptainId: string): Promise<void> {
  const { error } = await supabase.rpc('league_transfer_captain', {
    p_team_id: teamId,
    p_new_captain_id: newCaptainId,
  });
  if (error) throw new Error(error.message);
}
