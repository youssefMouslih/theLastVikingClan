export type LeagueSeasonStatus = 'DRAFT' | 'REGISTRATION' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type LeagueTeamStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'DISQUALIFIED';
export type LeagueMemberRole = 'CAPTAIN' | 'PLAYER';
export type LeagueMemberStatus = 'ACTIVE' | 'LEFT' | 'REMOVED' | 'REPLACED';
export type LeagueInviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED';
export type LeagueMatchdayStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'COMPLETED';
export type LeagueFixtureStatus =
  | 'SCHEDULED'
  | 'LINEUPS_PENDING'
  | 'LINEUPS_REVEALED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FORFEITED'
  | 'CANCELLED';
export type LeagueLineupStatus = 'DRAFT' | 'SUBMITTED' | 'REVEALED' | 'LOCKED';
export type LeagueLineupRole = 'STARTER' | 'SUB';
export type LeagueDuelStatus =
  | 'SCHEDULED'
  | 'STARTED'
  | 'AWAITING_RESULTS'
  | 'DISPUTED'
  | 'CONFIRMED'
  | 'FORFEITED'
  | 'CANCELLED';
export type LeagueDuelSide = 'HOME' | 'AWAY';
export type LeagueReportStatus = 'SUBMITTED' | 'CONFIRMED' | 'DISPUTED' | 'REJECTED';
export type LeagueDecidedBy = 'REGULATION' | 'EXTRA_TIME' | 'PENALTIES';
export type LeagueDisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED';

export interface LeagueSeason {
  id: string;
  name: string;
  description: string | null;
  status: LeagueSeasonStatus;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  starts_at: string | null;
  matchday_days: number;
  min_teams: number;
  max_teams: number;
  roster_min: number;
  roster_max: number;
  points_win: number;
  points_draw: number;
  points_loss: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeagueTeam {
  id: string;
  season_id: string;
  name: string;
  logo_path: string | null;
  captain_id: string;
  status: LeagueTeamStatus;
  approved_by: string | null;
  approved_at: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeagueTeamMember {
  id: string;
  season_id: string;
  team_id: string;
  player_id: string;
  role: LeagueMemberRole;
  status: LeagueMemberStatus;
  joined_at: string;
  joined_matchday: number | null;
  left_at: string | null;
  replaced_by: string | null;
  replaced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeagueTeamInvite {
  id: string;
  season_id: string;
  team_id: string;
  player_id: string;
  invited_by: string;
  status: LeagueInviteStatus;
  message: string | null;
  created_at: string;
  expires_at: string | null;
  responded_at: string | null;
}

export interface LeagueMatchday {
  id: string;
  season_id: string;
  number: number;
  opens_at: string;
  deadline: string;
  status: LeagueMatchdayStatus;
  created_at: string;
  updated_at: string;
}

export interface LeagueBye {
  id: string;
  season_id: string;
  matchday_id: string;
  team_id: string;
  created_at: string;
}

export interface LeagueFixture {
  id: string;
  season_id: string;
  matchday_id: string;
  leg: 1 | 2;
  home_team_id: string;
  away_team_id: string;
  status: LeagueFixtureStatus;
  home_duel_wins: number;
  away_duel_wins: number;
  home_points: number;
  away_points: number;
  revealed_at: string | null;
  completed_at: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeagueLineup {
  id: string;
  fixture_id: string;
  team_id: string;
  submitted_by: string | null;
  submitted_at: string | null;
  version: number;
  status: LeagueLineupStatus;
  created_at: string;
  updated_at: string;
}

export interface LeagueLineupPlayer {
  id: string;
  lineup_id: string;
  player_id: string;
  role: LeagueLineupRole;
  slot: number;
  created_at: string;
}

export interface LeagueDuel {
  id: string;
  fixture_id: string;
  matchday_id: string;
  slot: number;
  home_team_id: string;
  away_team_id: string;
  home_player_id: string;
  away_player_id: string;
  status: LeagueDuelStatus;
  started_at: string | null;
  deadline: string;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  confirmed_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeagueSubstitution {
  id: string;
  duel_id: string;
  fixture_id: string;
  team_id: string;
  out_player_id: string;
  in_player_id: string;
  requested_by: string;
  created_at: string;
}

export interface LeagueDuelReport {
  id: string;
  duel_id: string;
  player_id: string;
  team_id: string;
  side: LeagueDuelSide;
  score_for: number;
  score_against: number;
  decided_by: LeagueDecidedBy;
  evidence_path: string;
  note: string | null;
  status: LeagueReportStatus;
  submitted_at: string;
  updated_at: string;
}

export interface LeagueDispute {
  id: string;
  duel_id: string;
  opened_by: string;
  reason: string;
  evidence_path: string | null;
  status: LeagueDisputeStatus;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaguePenalty {
  id: string;
  season_id: string;
  team_id: string;
  matchday_id: string | null;
  points: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface LeagueTiebreakOrder {
  id: string;
  season_id: string;
  team_id: string;
  position: number;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface LeagueAuditLog {
  id: string;
  season_id: string | null;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface LeagueCreateSeasonInput {
  name: string;
  description?: string | null;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  starts_at?: string | null;
  matchday_days?: number;
  min_teams?: number;
  max_teams?: number;
  roster_min?: number;
  roster_max?: number;
}

export interface LeagueSeasonSettings {
  name: string;
  description: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  starts_at: string | null;
  matchday_days: number;
  min_teams: number;
  max_teams: number;
  roster_min: number;
  roster_max: number;
}

export interface LeagueLineupEntry {
  player_id: string;
  role: LeagueLineupRole;
  slot: 1 | 2 | 3 | 4;
}

export interface LeagueResultInput {
  score_for: number;
  score_against: number;
  decided_by: LeagueDecidedBy;
  evidence_path: string;
  note?: string | null;
}

export interface LeagueDisputeResolutionInput {
  winner_team_id: string;
  home_score: number | null;
  away_score: number | null;
  resolution: string;
  forfeit?: boolean;
}

export interface LeagueStandingRow {
  standing_position: number;
  team_id: string;
  team_name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  duels_won: number;
  duels_lost: number;
  duel_diff: number;
  fixture_points: number;
  penalty_points: number;
  points: number;
}

export interface LeaguePlayerStatsRow {
  player_id: string;
  player_name: string;
  team_id: string;
  team_name: string;
  duels_played: number;
  duels_won: number;
  duels_lost: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  win_rate: number | null;
}

export interface LeagueTeamStatsRow {
  team_id: string;
  team_name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  duels_won: number;
  duels_lost: number;
  duel_diff: number;
  goals_for: number;
  goals_against: number;
  points: number;
}

export interface LeagueProfileRef {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface LeagueTeamRef {
  id: string;
  name: string;
  status: LeagueTeamStatus;
}

export interface LeagueMemberWithProfile extends LeagueTeamMember {
  player: LeagueProfileRef | null;
}

export interface LeagueTeamSummary extends LeagueTeam {
  captain_profile: LeagueProfileRef | null;
  member_count: number;
  members: LeagueMemberWithProfile[];
}

export interface LeagueInviteWithContext extends LeagueTeamInvite {
  team: LeagueTeamRef | null;
  season: Pick<LeagueSeason, 'id' | 'name' | 'status'> | null;
  player: LeagueProfileRef | null;
}

export interface LeagueFixtureWithContext extends LeagueFixture {
  home: LeagueTeamRef | null;
  away: LeagueTeamRef | null;
  matchday: Pick<LeagueMatchday, 'id' | 'number' | 'opens_at' | 'deadline' | 'status'> | null;
}

export interface LeagueMatchdayWithFixtures extends LeagueMatchday {
  fixtures: LeagueFixtureWithContext[];
  byes: LeagueTeamRef[];
}

export interface LeagueSchedule {
  season_id: string;
  matchdays: LeagueMatchdayWithFixtures[];
  fixtures: LeagueFixtureWithContext[];
  teams: Record<string, LeagueTeamRef>;
}
