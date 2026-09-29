// Single-clan model (§9). No multi-tenant clan_id needed.
// Timezone: Africa/Casablanca, DB stores UTC (§14).

export type Role = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'PLAYER';
export type MemberStatus = 'INVITED' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'LEFT' | 'REMOVED';

export type CompetitionType = 'LEAGUE' | 'CUP' | 'TOURNAMENT' | 'SPECIAL_EVENT';
export type CompetitionStatus =
  | 'DRAFT'
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'READY'
  | 'ACTIVE'
  | 'FINISHED'
  | 'ARCHIVED';

export type MatchStatus =
  | 'SCHEDULED'
  | 'PLAYED'
  | 'RESULT_SUBMITTED'
  | 'CONFIRMED'
  | 'DISPUTED'
  | 'OVERDUE'
  | 'FORFEIT'
  | 'CANCELLED';

export type DisputeStatus = 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED';
export type AnnouncementPriority = 'NORMAL' | 'IMPORTANT' | 'URGENT';

export interface Profile {
  id: string; // Supabase Auth user id (§74)
  username: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  country: string | null;
  efootball_name: string | null;
  efootball_id: string | null;
  bio: string | null;
  role: Role;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface ClanSettings {
  id: string;
  name: string;
  tag: string | null;
  logo_url: string | null;
  banner_url: string | null;
  description: string | null;
  rules: string | null;
  country: string | null;
  timezone: string; // e.g. Africa/Casablanca
  created_at: string;
  updated_at: string;
}

export interface Competition {
  id: string;
  name: string;
  description: string | null;
  type: CompetitionType;
  status: CompetitionStatus;
  min_players: number;
  max_players: number;
  registration_start: string | null;
  registration_deadline: string | null;
  start_date: string | null;
  end_date: string | null;
  match_deadline_hours: number;
  join_code: string;
  join_enabled: boolean;
  format: string | null;
  points_win: number;
  points_draw: number;
  points_loss: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Soft-delete (§two-person rule): never hard-removed; hidden from players.
  is_deleted: boolean;
  delete_requested_by: string | null;
  delete_requested_at: string | null;
  delete_approved_by: string | null;
}

export interface CompetitionParticipant {
  id: string;
  competition_id: string;
  player_id: string;
  status: string;
  joined_at: string;
  left_at: string | null;
  replacement_for: string | null;
  replacement_date: string | null;
  replacement_reason: string | null;
}

export interface Match {
  id: string;
  competition_id: string;
  round_id: string | null;
  player_a_id: string;
  player_b_id: string;
  score_a: number | null;
  score_b: number | null;
  status: MatchStatus;
  scheduled_at: string | null;
  deadline: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  winner_id: string | null;
  forfeit_player_id: string | null;
}

export interface StandingRow {
  player_id: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
}
