-- VIK Clan migration 0040: 4vs4 League schema foundation.
-- Run AFTER 0039. Additive only: no existing table is altered or removed.
--
-- Scope (Phase 1):
--   * league_* tables, constraints, indexes, and server-side guard triggers;
--   * RLS enabled on every table; SELECT-only client policies;
--   * helpers used by RLS to hide lineups until reveal;
--   * realtime publication entries;
--   * authoritative writes remain RPC-only (functions arrive in 0041).
--
-- Not in this migration:
--   * league RPCs / scoring / standings / cron (0041, 0042);
--   * new storage buckets. Result evidence reuses the existing private
--     match-evidence bucket and will be path-validated in 0041.
--
-- Reuses: public.profiles, public.is_clan_role(text[]), auth.uid().
-- Convention: UTC timestamptz; server timestamps; partial unique indexes.

-- ============================================================================
-- 1. Tables
-- ============================================================================

create table if not exists public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','REGISTRATION','ACTIVE','COMPLETED','ARCHIVED')),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_at timestamptz,
  matchday_days int not null default 7 check (matchday_days between 1 and 14),
  min_teams int not null default 4 check (min_teams between 2 and 16),
  max_teams int not null default 8 check (max_teams between 2 and 16),
  roster_min int not null default 6 check (roster_min between 6 and 8),
  roster_max int not null default 8 check (roster_max between 6 and 8),
  points_win int not null default 3 check (points_win between 0 and 10),
  points_draw int not null default 1 check (points_draw between 0 and 10),
  points_loss int not null default 0 check (points_loss between 0 and 10),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_seasons_name_check check (char_length(btrim(name)) between 2 and 80),
  constraint league_seasons_teams_check check (max_teams >= min_teams),
  constraint league_seasons_roster_check check (roster_max >= roster_min),
  constraint league_seasons_window_check check (
    registration_opens_at is null
    or registration_closes_at is null
    or registration_closes_at > registration_opens_at
  ),
  constraint league_seasons_start_check check (
    starts_at is null
    or registration_closes_at is null
    or starts_at >= registration_closes_at
  )
);

create table if not exists public.league_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  name text not null,
  logo_path text,
  captain_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED','WITHDRAWN','DISQUALIFIED')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_teams_name_check check (char_length(btrim(name)) between 2 and 40),
  unique (id, season_id)
);

create table if not exists public.league_team_members (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  team_id uuid not null,
  player_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'PLAYER' check (role in ('CAPTAIN','PLAYER')),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','LEFT','REMOVED','REPLACED')),
  joined_at timestamptz not null default now(),
  joined_matchday int check (joined_matchday is null or joined_matchday > 0),
  left_at timestamptz,
  replaced_by uuid references public.profiles(id) on delete set null,
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_members_left_check check (left_at is null or left_at >= joined_at),
  constraint league_members_replace_check check (replaced_by is null or replaced_by <> player_id),
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_team_invites (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  team_id uuid not null,
  player_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING','ACCEPTED','DECLINED','REVOKED','EXPIRED')),
  message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz,
  constraint league_invites_self_check check (player_id <> invited_by),
  constraint league_invites_message_check check (message is null or char_length(message) <= 500),
  constraint league_invites_expiry_check check (expires_at is null or expires_at > created_at),
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_matchdays (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  number int not null check (number > 0),
  opens_at timestamptz not null,
  deadline timestamptz not null,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED','OPEN','CLOSED','COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_matchdays_window_check check (deadline > opens_at),
  unique (season_id, number),
  unique (id, season_id)
);

create table if not exists public.league_byes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  matchday_id uuid not null,
  team_id uuid not null,
  created_at timestamptz not null default now(),
  unique (matchday_id, team_id),
  foreign key (matchday_id, season_id)
    references public.league_matchdays(id, season_id) on delete cascade,
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  matchday_id uuid not null,
  leg int not null check (leg in (1, 2)),
  home_team_id uuid not null,
  away_team_id uuid not null,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED','LINEUPS_PENDING','LINEUPS_REVEALED','IN_PROGRESS','COMPLETED','FORFEITED','CANCELLED')),
  home_duel_wins int not null default 0 check (home_duel_wins between 0 and 4),
  away_duel_wins int not null default 0 check (away_duel_wins between 0 and 4),
  home_points int not null default 0 check (home_points in (0,1,3)),
  away_points int not null default 0 check (away_points in (0,1,3)),
  revealed_at timestamptz,
  completed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_fixtures_teams_check check (home_team_id <> away_team_id),
  constraint league_fixtures_duel_total_check check (home_duel_wins + away_duel_wins <= 4),
  constraint league_fixtures_final_total_check check (
    status not in ('COMPLETED','FORFEITED')
    or home_duel_wins + away_duel_wins = 4
  ),
  constraint league_fixtures_final_points_check check (
    status not in ('COMPLETED','FORFEITED')
    or (home_points = 3 and away_points = 0)
    or (home_points = 1 and away_points = 1)
    or (home_points = 0 and away_points = 3)
  ),
  unique (season_id, leg, home_team_id, away_team_id),
  foreign key (matchday_id, season_id)
    references public.league_matchdays(id, season_id) on delete cascade,
  foreign key (home_team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade,
  foreign key (away_team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_lineups (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.league_fixtures(id) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  version int not null default 1 check (version > 0),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','SUBMITTED','REVEALED','LOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, team_id)
);

create table if not exists public.league_lineup_players (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.league_lineups(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('STARTER','SUB')),
  slot int not null check (slot between 1 and 4),
  created_at timestamptz not null default now(),
  unique (lineup_id, player_id),
  unique (lineup_id, role, slot)
);

create table if not exists public.league_duels (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.league_fixtures(id) on delete cascade,
  matchday_id uuid not null references public.league_matchdays(id) on delete cascade,
  slot int not null check (slot between 1 and 4),
  home_team_id uuid not null references public.league_teams(id) on delete cascade,
  away_team_id uuid not null references public.league_teams(id) on delete cascade,
  home_player_id uuid not null references public.profiles(id) on delete restrict,
  away_player_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED','STARTED','AWAITING_RESULTS','DISPUTED','CONFIRMED','FORFEITED','CANCELLED')),
  started_at timestamptz,
  deadline timestamptz not null,
  home_score int check (home_score is null or home_score between 0 and 99),
  away_score int check (away_score is null or away_score between 0 and 99),
  winner_team_id uuid references public.league_teams(id) on delete restrict,
  confirmed_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_duels_teams_check check (home_team_id <> away_team_id),
  constraint league_duels_winner_check check (
    winner_team_id is null or winner_team_id in (home_team_id, away_team_id)
  ),
  constraint league_duels_confirmed_check check (
    status <> 'CONFIRMED'
    or (home_score is not null and away_score is not null
        and home_score <> away_score and winner_team_id is not null)
  ),
  constraint league_duels_forfeit_winner_check check (
    status <> 'FORFEITED' or winner_team_id is not null
  ),
  unique (fixture_id, slot),
  unique (fixture_id, home_player_id),
  unique (fixture_id, away_player_id)
);

create table if not exists public.league_substitutions (
  id uuid primary key default gen_random_uuid(),
  duel_id uuid not null references public.league_duels(id) on delete cascade,
  fixture_id uuid not null references public.league_fixtures(id) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete cascade,
  out_player_id uuid not null references public.profiles(id) on delete restrict,
  in_player_id uuid not null references public.profiles(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint league_substitutions_player_check check (out_player_id <> in_player_id),
  unique (duel_id, team_id),
  unique (fixture_id, team_id, in_player_id)
);

create table if not exists public.league_duel_reports (
  id uuid primary key default gen_random_uuid(),
  duel_id uuid not null references public.league_duels(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete restrict,
  team_id uuid not null references public.league_teams(id) on delete restrict,
  side text not null check (side in ('HOME','AWAY')),
  score_for int not null check (score_for between 0 and 99),
  score_against int not null check (score_against between 0 and 99),
  decided_by text not null default 'REGULATION'
    check (decided_by in ('REGULATION','EXTRA_TIME','PENALTIES')),
  evidence_path text not null check (length(btrim(evidence_path)) > 0),
  note text,
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED','CONFIRMED','DISPUTED','REJECTED')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_reports_decisive_check check (score_for <> score_against),
  constraint league_reports_note_check check (note is null or char_length(note) <= 1000),
  unique (duel_id, player_id)
);

create table if not exists public.league_disputes (
  id uuid primary key default gen_random_uuid(),
  duel_id uuid not null references public.league_duels(id) on delete cascade,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  evidence_path text,
  status text not null default 'OPEN'
    check (status in ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED')),
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_disputes_reason_check check (char_length(btrim(reason)) between 3 and 1000)
);

create table if not exists public.league_penalties (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  team_id uuid not null,
  matchday_id uuid references public.league_matchdays(id) on delete set null,
  points int not null check (points between -100 and 100 and points <> 0),
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint league_penalties_reason_check check (char_length(btrim(reason)) between 3 and 1000),
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_tiebreak_orders (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  team_id uuid not null,
  position int not null check (position > 0),
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint league_tiebreak_reason_check check (char_length(btrim(reason)) between 3 and 1000),
  unique (season_id, team_id),
  unique (season_id, position),
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_audit_logs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.league_seasons(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. Indexes and partial uniqueness
-- ============================================================================

create unique index if not exists league_seasons_one_active_idx
  on public.league_seasons (status) where status = 'ACTIVE';

create unique index if not exists league_teams_name_ci_idx
  on public.league_teams (season_id, lower(name));

create unique index if not exists league_teams_one_captain_idx
  on public.league_teams (season_id, captain_id)
  where status in ('PENDING','APPROVED');

create unique index if not exists league_members_one_active_idx
  on public.league_team_members (season_id, player_id)
  where status = 'ACTIVE';

create unique index if not exists league_members_one_captain_idx
  on public.league_team_members (team_id)
  where role = 'CAPTAIN' and status = 'ACTIVE';

create unique index if not exists league_invites_one_pending_idx
  on public.league_team_invites (team_id, player_id)
  where status = 'PENDING';

create index if not exists league_members_player_idx
  on public.league_team_members (player_id, status);

create index if not exists league_invites_player_idx
  on public.league_team_invites (player_id, status);

create index if not exists league_fixtures_season_idx
  on public.league_fixtures (season_id, matchday_id);

create index if not exists league_fixtures_teams_idx
  on public.league_fixtures (home_team_id, away_team_id);

create index if not exists league_lineups_fixture_idx
  on public.league_lineups (fixture_id);

create index if not exists league_duels_fixture_idx
  on public.league_duels (fixture_id, slot);

create index if not exists league_duels_players_idx
  on public.league_duels (home_player_id, away_player_id);

create index if not exists league_reports_duel_idx
  on public.league_duel_reports (duel_id, status);

create unique index if not exists league_disputes_one_open_idx
  on public.league_disputes (duel_id)
  where status in ('OPEN','UNDER_REVIEW');

create index if not exists league_disputes_status_idx
  on public.league_disputes (status, created_at);

create index if not exists league_penalties_team_idx
  on public.league_penalties (season_id, team_id);

create index if not exists league_audit_season_idx
  on public.league_audit_logs (season_id, created_at desc);

-- ============================================================================
-- 3. RLS helpers (definer: must read across tables without recursive RLS)
-- ============================================================================

create or replace function public.league_is_team_member(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.league_team_members m
    join public.profiles p
      on p.id = m.player_id
     and p.status = 'ACTIVE'
    where m.team_id = p_team_id
      and m.player_id = p_user_id
      and m.status = 'ACTIVE'
  );
$$;

create or replace function public.league_is_team_captain(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.league_teams t
    join public.league_team_members m
      on m.team_id = t.id
     and m.player_id = p_user_id
     and m.role = 'CAPTAIN'
     and m.status = 'ACTIVE'
    join public.profiles p
      on p.id = m.player_id
     and p.status = 'ACTIVE'
    where t.id = p_team_id
      and t.captain_id = p_user_id
  );
$$;

-- True for staff, the lineups own team, and the opponent only after reveal.
create or replace function public.league_can_view_lineup(p_fixture_id uuid, p_team_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_home uuid;
  v_away uuid;
  v_status text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return true;
  end if;

  select f.home_team_id, f.away_team_id, f.status
    into v_home, v_away, v_status
  from public.league_fixtures f
  where f.id = p_fixture_id;

  if v_home is null or p_team_id not in (v_home, v_away) then
    return false;
  end if;

  if public.league_is_team_member(p_team_id, v_uid) then
    return true;
  end if;

  if v_status in ('LINEUPS_REVEALED','IN_PROGRESS','COMPLETED','FORFEITED') then
    return public.league_is_team_member(
      case when p_team_id = v_home then v_away else v_home end,
      v_uid
    );
  end if;

  return false;
end;
$$;

create or replace function public.league_can_view_lineup_player(p_lineup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select public.league_can_view_lineup(l.fixture_id, l.team_id)
    from public.league_lineups l
    where l.id = p_lineup_id
  ), false);
$$;

-- Reports/disputes are visible to both squads (captains need them) and staff.
create or replace function public.league_can_view_duel_report(p_duel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE'
    )
    and (
      public.is_clan_role(array['OWNER','ADMIN','MODERATOR'])
      or exists (
        select 1
        from public.league_duels d
        join public.league_team_members m
          on (m.team_id = d.home_team_id or m.team_id = d.away_team_id)
         and m.player_id = auth.uid()
         and m.status = 'ACTIVE'
        where d.id = p_duel_id
      )
      or exists (
        select 1 from public.league_duels d
        where d.id = p_duel_id
          and (d.home_player_id = auth.uid() or d.away_player_id = auth.uid())
      )
      or exists (
        select 1 from public.league_duel_reports r
        where r.duel_id = p_duel_id and r.player_id = auth.uid()
      )
      or exists (
        select 1 from public.league_disputes x
        where x.duel_id = p_duel_id and x.opened_by = auth.uid()
      )
    );
$$;

-- ============================================================================
-- 4. Guard triggers
-- ============================================================================

create or replace function public.league_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.league_guard_team()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_min int;
  v_max int;
  v_count int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.captain_id and p.status = 'ACTIVE'
  ) then
    raise exception 'League captain must be an ACTIVE clan member.';
  end if;

  if new.status = 'APPROVED' then
    select s.roster_min, s.roster_max
      into v_min, v_max
    from public.league_seasons s
    where s.id = new.season_id;

    select count(*) into v_count
    from public.league_team_members m
    where m.team_id = new.id and m.status = 'ACTIVE';

    if v_min is null or v_count < v_min or v_count > v_max then
      raise exception 'Approved league squad needs %-% active players (has %).',
        coalesce(v_min, 6), coalesce(v_max, 8), v_count;
    end if;

    if not exists (
      select 1 from public.league_team_members m
      where m.team_id = new.id
        and m.player_id = new.captain_id
        and m.role = 'CAPTAIN'
        and m.status = 'ACTIVE'
    ) then
      raise exception 'League captain must be an active squad member.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max int;
  v_count int;
  v_check_roster boolean := false;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.player_id and p.status = 'ACTIVE'
  ) then
    raise exception 'League squad members must be ACTIVE clan members.';
  end if;

  if new.status = 'ACTIVE' then
    if tg_op = 'INSERT' then
      v_check_roster := true;
    elsif old.status is distinct from 'ACTIVE'
       or old.team_id is distinct from new.team_id then
      v_check_roster := true;
    end if;
  end if;

  if v_check_roster then
    select s.roster_max into v_max
    from public.league_teams t
    join public.league_seasons s on s.id = t.season_id
    where t.id = new.team_id;

    if v_max is null then
      raise exception 'League squad or season not found.';
    end if;

    select count(*) into v_count
    from public.league_team_members m
    where m.team_id = new.team_id
      and m.status = 'ACTIVE'
      and m.id <> new.id;

    if v_count >= v_max then
      raise exception 'League squad is full (max % active players).', v_max;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_invite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_captain uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.player_id and p.status = 'ACTIVE'
  ) then
    raise exception 'Only ACTIVE clan members can receive league invites.';
  end if;

  select t.captain_id into v_captain
  from public.league_teams t
  where t.id = new.team_id;

  if v_captain is null then
    raise exception 'League squad not found.';
  end if;

  if new.player_id = v_captain then
    raise exception 'The captain is already part of the squad.';
  end if;

  if new.status = 'PENDING' and exists (
    select 1 from public.league_team_members m
    where m.season_id = new.season_id
      and m.player_id = new.player_id
      and m.status = 'ACTIVE'
  ) then
    raise exception 'Player already has an active league squad this season.';
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_fixture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected_home int;
  v_expected_away int;
begin
  if new.status in ('COMPLETED','FORFEITED') then
    if new.home_duel_wins + new.away_duel_wins <> 4 then
      raise exception 'A final league fixture must have exactly four decided duels.';
    end if;

    v_expected_home := case
      when new.home_duel_wins > new.away_duel_wins then 3
      when new.home_duel_wins = new.away_duel_wins then 1
      else 0
    end;
    v_expected_away := case
      when new.away_duel_wins > new.home_duel_wins then 3
      when new.away_duel_wins = new.home_duel_wins then 1
      else 0
    end;

    if new.home_points <> v_expected_home or new.away_points <> v_expected_away then
      raise exception 'League fixture points do not match the 3/1/0 duel result.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_lineup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_home uuid;
  v_away uuid;
  v_starters int;
  v_subs int;
begin
  select f.home_team_id, f.away_team_id
    into v_home, v_away
  from public.league_fixtures f
  where f.id = new.fixture_id;

  if v_home is null then
    raise exception 'League fixture not found.';
  end if;

  if new.team_id not in (v_home, v_away) then
    raise exception 'Lineup team is not part of this fixture.';
  end if;

  if new.status <> 'DRAFT' then
    select
      count(*) filter (where lp.role = 'STARTER'),
      count(*) filter (where lp.role = 'SUB')
      into v_starters, v_subs
    from public.league_lineup_players lp
    where lp.lineup_id = new.id;

    if v_starters <> 4 then
      raise exception 'A league lineup needs exactly 4 starters (has %).', v_starters;
    end if;
    if v_subs < 2 or v_subs > 4 then
      raise exception 'A league lineup needs 2-4 substitutes (has %).', v_subs;
    end if;

    if exists (
      select 1
      from public.league_lineup_players lp
      where lp.lineup_id = new.id
        and not exists (
          select 1 from public.league_team_members m
          where m.team_id = new.team_id
            and m.player_id = lp.player_id
            and m.status = 'ACTIVE'
        )
    ) then
      raise exception 'Every lineup player must be an ACTIVE squad member.';
    end if;

    if new.submitted_at is null then
      new.submitted_at := now();
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_lineup_player()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
  v_status text;
begin
  select l.team_id, l.status
    into v_team, v_status
  from public.league_lineups l
  where l.id = new.lineup_id;

  if v_team is null then
    raise exception 'League lineup not found.';
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'Lineup players can only be changed while the lineup is DRAFT.';
  end if;

  if not public.league_is_team_member(v_team, new.player_id) then
    raise exception 'Lineup player is not an ACTIVE member of this squad.';
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_duel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_home uuid;
  v_away uuid;
  v_matchday uuid;
begin
  select f.home_team_id, f.away_team_id, f.matchday_id
    into v_home, v_away, v_matchday
  from public.league_fixtures f
  where f.id = new.fixture_id;

  if v_home is null then
    raise exception 'League fixture not found.';
  end if;

  if new.home_team_id <> v_home or new.away_team_id <> v_away then
    raise exception 'Duel teams do not match the fixture.';
  end if;

  if new.matchday_id <> v_matchday then
    raise exception 'Duel matchday does not match the fixture.';
  end if;

  if tg_op = 'INSERT' then
    if not public.league_is_team_member(v_home, new.home_player_id) then
      raise exception 'Home duel player is not an ACTIVE home squad member.';
    end if;
    if not public.league_is_team_member(v_away, new.away_player_id) then
      raise exception 'Away duel player is not an ACTIVE away squad member.';
    end if;
  else
    if new.home_player_id is distinct from old.home_player_id
       and not public.league_is_team_member(v_home, new.home_player_id) then
      raise exception 'Home duel player is not an ACTIVE home squad member.';
    end if;
    if new.away_player_id is distinct from old.away_player_id
       and not public.league_is_team_member(v_away, new.away_player_id) then
      raise exception 'Away duel player is not an ACTIVE away squad member.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_substitution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.league_duels%rowtype;
begin
  select * into v_duel
  from public.league_duels d
  where d.id = new.duel_id;

  if v_duel.id is null then
    raise exception 'League duel not found.';
  end if;

  if new.fixture_id <> v_duel.fixture_id then
    raise exception 'Substitution fixture does not match the duel.';
  end if;

  if new.team_id not in (v_duel.home_team_id, v_duel.away_team_id) then
    raise exception 'Substitution team is not part of this duel.';
  end if;

  if v_duel.started_at is not null then
    raise exception 'Substitutions are locked after the duel starts.';
  end if;

  if exists (
    select 1 from public.league_duel_reports r
    where r.duel_id = new.duel_id
  ) then
    raise exception 'Substitutions are locked after a result is reported.';
  end if;

  if new.team_id = v_duel.home_team_id
     and new.out_player_id <> v_duel.home_player_id then
    raise exception 'Substituted-out player is not the current home duel player.';
  end if;
  if new.team_id = v_duel.away_team_id
     and new.out_player_id <> v_duel.away_player_id then
    raise exception 'Substituted-out player is not the current away duel player.';
  end if;

  if not public.league_is_team_member(new.team_id, new.in_player_id) then
    raise exception 'Substitute is not an ACTIVE squad member.';
  end if;

  if not exists (
    select 1
    from public.league_lineup_players lp
    join public.league_lineups l on l.id = lp.lineup_id
    where l.fixture_id = v_duel.fixture_id
      and l.team_id = new.team_id
      and lp.player_id = new.in_player_id
      and lp.role = 'SUB'
  ) then
    raise exception 'Substitute is not on this fixture bench.';
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_duel_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.league_duels%rowtype;
begin
  select * into v_duel
  from public.league_duels d
  where d.id = new.duel_id;

  if v_duel.id is null then
    raise exception 'League duel not found.';
  end if;

  if new.team_id = v_duel.home_team_id then
    if new.side <> 'HOME' or new.player_id <> v_duel.home_player_id then
      raise exception 'Home report must come from the current home duel player.';
    end if;
  elsif new.team_id = v_duel.away_team_id then
    if new.side <> 'AWAY' or new.player_id <> v_duel.away_player_id then
      raise exception 'Away report must come from the current away duel player.';
    end if;
  else
    raise exception 'Report team is not part of this duel.';
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('CONFIRMED','REJECTED') then
      raise exception 'Confirmed or rejected league reports are immutable.';
    end if;
  end if;

  if new.evidence_path not like 'league/%' then
    raise exception 'League evidence must use the league/ storage prefix.';
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_dispute()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    if not exists (
      select 1
      from public.league_duels d
      join public.league_team_members m
        on (m.team_id = d.home_team_id or m.team_id = d.away_team_id)
       and m.player_id = new.opened_by
       and m.status = 'ACTIVE'
      where d.id = new.duel_id
    ) then
      raise exception 'Only a duel participant, participant squad member, or staff can open a dispute.';
    end if;
  end if;

  if new.evidence_path is not null and new.evidence_path not like 'league/%' then
    raise exception 'League evidence must use the league/ storage prefix.';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 5. Trigger installation
-- ============================================================================

drop trigger if exists league_seasons_touch on public.league_seasons;
create trigger league_seasons_touch before update on public.league_seasons
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_teams_touch on public.league_teams;
create trigger league_teams_touch before update on public.league_teams
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_members_touch on public.league_team_members;
create trigger league_members_touch before update on public.league_team_members
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_matchdays_touch on public.league_matchdays;
create trigger league_matchdays_touch before update on public.league_matchdays
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_fixtures_touch on public.league_fixtures;
create trigger league_fixtures_touch before update on public.league_fixtures
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_lineups_touch on public.league_lineups;
create trigger league_lineups_touch before update on public.league_lineups
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_duels_touch on public.league_duels;
create trigger league_duels_touch before update on public.league_duels
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_reports_touch on public.league_duel_reports;
create trigger league_reports_touch before update on public.league_duel_reports
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_disputes_touch on public.league_disputes;
create trigger league_disputes_touch before update on public.league_disputes
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_teams_guard on public.league_teams;
create trigger league_teams_guard before insert or update on public.league_teams
  for each row execute function public.league_guard_team();

drop trigger if exists league_members_guard on public.league_team_members;
create trigger league_members_guard before insert or update on public.league_team_members
  for each row execute function public.league_guard_member();

drop trigger if exists league_invites_guard on public.league_team_invites;
create trigger league_invites_guard before insert or update on public.league_team_invites
  for each row execute function public.league_guard_invite();

drop trigger if exists league_fixtures_guard on public.league_fixtures;
create trigger league_fixtures_guard before insert or update on public.league_fixtures
  for each row execute function public.league_guard_fixture();

drop trigger if exists league_lineups_guard on public.league_lineups;
create trigger league_lineups_guard before insert or update on public.league_lineups
  for each row execute function public.league_guard_lineup();

drop trigger if exists league_lineup_players_guard on public.league_lineup_players;
create trigger league_lineup_players_guard before insert or update on public.league_lineup_players
  for each row execute function public.league_guard_lineup_player();

drop trigger if exists league_duels_guard on public.league_duels;
create trigger league_duels_guard before insert or update on public.league_duels
  for each row execute function public.league_guard_duel();

drop trigger if exists league_substitutions_guard on public.league_substitutions;
create trigger league_substitutions_guard before insert on public.league_substitutions
  for each row execute function public.league_guard_substitution();

drop trigger if exists league_reports_guard on public.league_duel_reports;
create trigger league_reports_guard before insert or update on public.league_duel_reports
  for each row execute function public.league_guard_duel_report();

drop trigger if exists league_disputes_guard on public.league_disputes;
create trigger league_disputes_guard before insert or update on public.league_disputes
  for each row execute function public.league_guard_dispute();

-- ============================================================================
-- 6. RLS: read policies only. All writes go through definer RPCs in 0041.
-- ============================================================================

alter table public.league_seasons enable row level security;
alter table public.league_teams enable row level security;
alter table public.league_team_members enable row level security;
alter table public.league_team_invites enable row level security;
alter table public.league_matchdays enable row level security;
alter table public.league_byes enable row level security;
alter table public.league_fixtures enable row level security;
alter table public.league_lineups enable row level security;
alter table public.league_lineup_players enable row level security;
alter table public.league_duels enable row level security;
alter table public.league_substitutions enable row level security;
alter table public.league_duel_reports enable row level security;
alter table public.league_disputes enable row level security;
alter table public.league_penalties enable row level security;
alter table public.league_tiebreak_orders enable row level security;
alter table public.league_audit_logs enable row level security;

drop policy if exists "league read seasons" on public.league_seasons;
create policy "league read seasons" on public.league_seasons
  for select to authenticated using (true);

drop policy if exists "league read teams" on public.league_teams;
create policy "league read teams" on public.league_teams
  for select to authenticated using (true);

drop policy if exists "league read members" on public.league_team_members;
create policy "league read members" on public.league_team_members
  for select to authenticated using (true);

drop policy if exists "league read own invites" on public.league_team_invites;
create policy "league read own invites" on public.league_team_invites
  for select to authenticated using (
    player_id = auth.uid()
    or public.league_is_team_captain(team_id, auth.uid())
    or public.is_clan_role(array['OWNER','ADMIN','MODERATOR'])
  );

drop policy if exists "league read matchdays" on public.league_matchdays;
create policy "league read matchdays" on public.league_matchdays
  for select to authenticated using (true);

drop policy if exists "league read byes" on public.league_byes;
create policy "league read byes" on public.league_byes
  for select to authenticated using (true);

drop policy if exists "league read fixtures" on public.league_fixtures;
create policy "league read fixtures" on public.league_fixtures
  for select to authenticated using (true);

drop policy if exists "league read visible lineups" on public.league_lineups;
create policy "league read visible lineups" on public.league_lineups
  for select to authenticated using (
    public.league_can_view_lineup(fixture_id, team_id)
  );

drop policy if exists "league read visible lineup players" on public.league_lineup_players;
create policy "league read visible lineup players" on public.league_lineup_players
  for select to authenticated using (
    public.league_can_view_lineup_player(lineup_id)
  );

drop policy if exists "league read duels" on public.league_duels;
create policy "league read duels" on public.league_duels
  for select to authenticated using (true);

drop policy if exists "league read substitutions" on public.league_substitutions;
create policy "league read substitutions" on public.league_substitutions
  for select to authenticated using (true);

drop policy if exists "league read duel reports" on public.league_duel_reports;
create policy "league read duel reports" on public.league_duel_reports
  for select to authenticated using (
    public.league_can_view_duel_report(duel_id)
  );

drop policy if exists "league read disputes" on public.league_disputes;
create policy "league read disputes" on public.league_disputes
  for select to authenticated using (
    public.league_can_view_duel_report(duel_id)
  );

drop policy if exists "league read penalties" on public.league_penalties;
create policy "league read penalties" on public.league_penalties
  for select to authenticated using (true);

drop policy if exists "league read tiebreaks" on public.league_tiebreak_orders;
create policy "league read tiebreaks" on public.league_tiebreak_orders
  for select to authenticated using (true);

drop policy if exists "league read audit" on public.league_audit_logs;
create policy "league read audit" on public.league_audit_logs
  for select to authenticated using (
    public.is_clan_role(array['OWNER','ADMIN','MODERATOR'])
  );

-- ============================================================================
-- 7. Function grants
-- ============================================================================

revoke all on function public.league_is_team_member(uuid, uuid) from public, anon;
revoke all on function public.league_is_team_captain(uuid, uuid) from public, anon;
revoke all on function public.league_can_view_lineup(uuid, uuid) from public, anon;
revoke all on function public.league_can_view_lineup_player(uuid) from public, anon;
revoke all on function public.league_can_view_duel_report(uuid) from public, anon;

grant execute on function public.league_is_team_member(uuid, uuid) to authenticated;
grant execute on function public.league_is_team_captain(uuid, uuid) to authenticated;
grant execute on function public.league_can_view_lineup(uuid, uuid) to authenticated;
grant execute on function public.league_can_view_lineup_player(uuid) to authenticated;
grant execute on function public.league_can_view_duel_report(uuid) to authenticated;

-- ============================================================================
-- 8. Realtime publication (RLS still filters every subscriber)
-- ============================================================================

do $$ begin alter publication supabase_realtime add table public.league_seasons; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_teams; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_team_members; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_matchdays; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_fixtures; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_lineups; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_duels; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_duel_reports; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_disputes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_penalties; exception when duplicate_object then null; end $$;

-- ============================================================================
-- 9. Documentation notes
-- ============================================================================
-- * RLS hides lineups until league_can_view_lineup returns true. Never fetch
--   opponent lineups directly and never hide them with CSS only.
-- * Direct writes to all league_* tables are intentionally denied. 0041 adds
--   SECURITY DEFINER RPCs for every mutation.
-- * league_duel_reports.evidence_path must start with league/ and points into
--   the existing private match-evidence bucket. 0041 validates the file exists.
-- * league_fixtures points are checked against the duel-wins result here and
--   are recomputed server-side in 0041/0042.
