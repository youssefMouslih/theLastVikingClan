-- VIK Clan migration 0041: 4vs4 League authoritative RPCs.
-- Run AFTER 0040. Additive only: no existing table is altered or removed.
--
-- Scope (Phase 2):
--   * season, squad, invite, roster, lineup, duel, result, dispute and
--     penalty mutations are SECURITY DEFINER RPCs only;
--   * every function authenticates auth.uid(), validates ownership and uses
--     row locks in a stable order (season -> team/matchday/fixture -> duel);
--   * fixture reveal/finalization and rankings are server-computed;
--   * evidence paths are checked against the private match-evidence bucket;
--   * client-supplied scores, points, winners and timestamps are never trusted.
--
-- Not in this migration:
--   * deadline cron (0042);
--   * frontend services/pages;
--   * optional league logos.

-- ============================================================================
-- 1. Authorization and audit helpers (internal; execute revoked below)
-- ============================================================================

create or replace function public.league_require_active()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.status = 'ACTIVE'
  ) then
    raise exception 'An ACTIVE clan member is required.';
  end if;
  return v_uid;
end;
$$;

create or replace function public.league_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.league_require_active();
begin
  if not public.is_clan_role(array['OWNER','ADMIN']) then
    raise exception 'Only OWNER or ADMIN can manage the league.';
  end if;
  return v_uid;
end;
$$;

create or replace function public.league_require_dispute_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.league_require_active();
begin
  if not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only league staff can resolve disputes.';
  end if;
  return v_uid;
end;
$$;

create or replace function public.league_require_captain(p_team_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.league_require_active();
  v_captain uuid;
begin
  select t.captain_id into v_captain
  from public.league_teams t
  where t.id = p_team_id;

  if v_captain is null then
    raise exception 'League squad not found.';
  end if;
  if v_captain <> v_uid then
    raise exception 'Only the league squad captain can do this.';
  end if;
  return v_uid;
end;
$$;

create or replace function public.league_audit(
  p_season_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old_data jsonb,
  p_new_data jsonb,
  p_reason text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.league_audit_logs
    (season_id, actor_id, action, entity_type, entity_id, old_data, new_data, reason)
  values
    (p_season_id, auth.uid(), p_action, p_entity_type, p_entity_id,
     p_old_data, p_new_data, p_reason);
$$;

create or replace function public.league_notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications
    (user_id, type, title, message, entity_type, entity_id)
  select p_user_id, p_type, p_title, p_message, p_entity_type, p_entity_id
  where p_user_id is not null;
$$;

create or replace function public.league_notify_team(
  p_team_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select distinct m.player_id
    from public.league_team_members m
    join public.profiles p on p.id = m.player_id and p.status = 'ACTIVE'
    where m.team_id = p_team_id and m.status = 'ACTIVE'
  loop
    perform public.league_notify(
      r.player_id, p_type, p_title, p_message, p_entity_type, p_entity_id);
  end loop;
end;
$$;

create or replace function public.league_notify_staff(
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select p.id
    from public.profiles p
    where p.status = 'ACTIVE'
      and p.role in ('OWNER','ADMIN','MODERATOR')
  loop
    perform public.league_notify(
      r.id, p_type, p_title, p_message, p_entity_type, p_entity_id);
  end loop;
end;
$$;

create or replace function public.league_notify_season(
  p_season_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select distinct m.player_id
    from public.league_team_members m
    join public.league_teams t on t.id = m.team_id and t.status = 'APPROVED'
    join public.profiles p on p.id = m.player_id and p.status = 'ACTIVE'
    where m.season_id = p_season_id and m.status = 'ACTIVE'
  loop
    perform public.league_notify(
      r.player_id, p_type, p_title, p_message, p_entity_type, p_entity_id);
  end loop;
end;
$$;

-- ============================================================================
-- 2. Row-lock helpers (stable order: season -> child row)
-- ============================================================================

create or replace function public.league_lock_season(p_season_id uuid)
returns public.league_seasons
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
begin
  select * into v_season
  from public.league_seasons s
  where s.id = p_season_id
  for update;

  if v_season.id is null then
    raise exception 'League season not found.';
  end if;
  return v_season;
end;
$$;

create or replace function public.league_lock_team(p_team_id uuid)
returns public.league_teams
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
begin
  select * into v_team
  from public.league_teams t
  where t.id = p_team_id;

  if v_team.id is null then
    raise exception 'League squad not found.';
  end if;

  perform public.league_lock_season(v_team.season_id);

  select * into v_team
  from public.league_teams t
  where t.id = p_team_id
  for update;

  return v_team;
end;
$$;

create or replace function public.league_lock_matchday(p_matchday_id uuid)
returns public.league_matchdays
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_matchday public.league_matchdays%rowtype;
begin
  select * into v_matchday
  from public.league_matchdays m
  where m.id = p_matchday_id;

  if v_matchday.id is null then
    raise exception 'League matchday not found.';
  end if;

  perform public.league_lock_season(v_matchday.season_id);

  select * into v_matchday
  from public.league_matchdays m
  where m.id = p_matchday_id
  for update;

  return v_matchday;
end;
$$;

create or replace function public.league_lock_fixture(p_fixture_id uuid)
returns public.league_fixtures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fixture public.league_fixtures%rowtype;
begin
  select * into v_fixture
  from public.league_fixtures f
  where f.id = p_fixture_id;

  if v_fixture.id is null then
    raise exception 'League fixture not found.';
  end if;

  perform public.league_lock_season(v_fixture.season_id);

  select * into v_fixture
  from public.league_fixtures f
  where f.id = p_fixture_id
  for update;

  return v_fixture;
end;
$$;

create or replace function public.league_lock_duel(p_duel_id uuid)
returns public.league_duels
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.league_duels%rowtype;
  v_season_id uuid;
begin
  select * into v_duel
  from public.league_duels d
  where d.id = p_duel_id;

  if v_duel.id is null then
    raise exception 'League duel not found.';
  end if;

  select f.season_id into v_season_id
  from public.league_fixtures f
  where f.id = v_duel.fixture_id;

  perform public.league_lock_season(v_season_id);

  select * into v_duel
  from public.league_duels d
  where d.id = p_duel_id
  for update;

  return v_duel;
end;
$$;

-- ============================================================================
-- 3. Evidence validation
-- ============================================================================

create or replace function public.league_validate_evidence(
  p_duel_id uuid,
  p_player_id uuid,
  p_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.league_duels%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_parts text[];
  v_size bigint;
  v_mime text;
begin
  if p_path is null or char_length(btrim(p_path)) = 0 or char_length(p_path) > 400 then
    raise exception 'League evidence path is required.';
  end if;
  if position('..' in p_path) > 0 or position(chr(92) in p_path) > 0 then
    raise exception 'League evidence path is not valid.';
  end if;

  select * into v_duel from public.league_duels where id = p_duel_id;
  if v_duel.id is null then
    raise exception 'League duel not found.';
  end if;
  select * into v_fixture from public.league_fixtures where id = v_duel.fixture_id;
  if v_fixture.id is null then
    raise exception 'League fixture not found.';
  end if;

  v_parts := string_to_array(p_path, '/');
  if array_length(v_parts, 1) is distinct from 5 then
    raise exception 'League evidence must use league/{season}/{fixture}/{duel}/{player}-file.';
  end if;
  if v_parts[1] <> 'league'
     or v_parts[2] <> v_fixture.season_id::text
     or v_parts[3] <> v_fixture.id::text
     or v_parts[4] <> v_duel.id::text
     or v_parts[5] not like p_player_id::text || '-%' then
    raise exception 'League evidence path does not match this duel and player.';
  end if;

  select
    case when (o.metadata->>'size') ~ '^[0-9]+$'
      then (o.metadata->>'size')::bigint else 0 end,
    coalesce(o.metadata->>'mimetype', o.metadata->>'contentType')
    into v_size, v_mime
  from storage.objects o
  where o.bucket_id = 'match-evidence'
    and o.name = p_path
    and o.owner::text = p_player_id::text;

  if v_size is null then
    raise exception 'League evidence file was not found or is not yours.';
  end if;
  if v_size < 1 or v_size > 5242880 then
    raise exception 'League evidence must be a non-empty image under 5 MB.';
  end if;
  if v_mime is null or v_mime not in ('image/jpeg','image/png','image/webp') then
    raise exception 'League evidence must be a JPEG, PNG or WebP image.';
  end if;
end;
$$;

-- ============================================================================
-- 4. Reveal and finalization (internal)
-- ============================================================================

create or replace function public.league_maybe_reveal_fixture(p_fixture_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fixture public.league_fixtures%rowtype;
  v_home_lineup public.league_lineups%rowtype;
  v_away_lineup public.league_lineups%rowtype;
  v_deadline timestamptz;
  v_slot int;
  v_home_player uuid;
  v_away_player uuid;
begin
  v_fixture := public.league_lock_fixture(p_fixture_id);

  if v_fixture.status not in ('SCHEDULED','LINEUPS_PENDING') then
    return false;
  end if;

  select * into v_home_lineup
  from public.league_lineups l
  where l.fixture_id = p_fixture_id
    and l.team_id = v_fixture.home_team_id
  for update;

  select * into v_away_lineup
  from public.league_lineups l
  where l.fixture_id = p_fixture_id
    and l.team_id = v_fixture.away_team_id
  for update;

  if v_home_lineup.id is null or v_away_lineup.id is null then
    return false;
  end if;
  if v_home_lineup.status not in ('SUBMITTED','REVEALED')
     or v_away_lineup.status not in ('SUBMITTED','REVEALED') then
    return false;
  end if;

  select m.deadline into v_deadline
  from public.league_matchdays m
  where m.id = v_fixture.matchday_id;

  if v_deadline is null then
    raise exception 'League matchday not found.';
  end if;

  for v_slot in 1..4 loop
    select lp.player_id into v_home_player
    from public.league_lineup_players lp
    where lp.lineup_id = v_home_lineup.id
      and lp.role = 'STARTER'
      and lp.slot = v_slot;

    select lp.player_id into v_away_player
    from public.league_lineup_players lp
    where lp.lineup_id = v_away_lineup.id
      and lp.role = 'STARTER'
      and lp.slot = v_slot;

    if v_home_player is null or v_away_player is null then
      raise exception 'Both lineups need four starters before reveal.';
    end if;

    insert into public.league_duels
      (fixture_id, matchday_id, slot, home_team_id, away_team_id,
       home_player_id, away_player_id, deadline)
    values
      (v_fixture.id, v_fixture.matchday_id, v_slot,
       v_fixture.home_team_id, v_fixture.away_team_id,
       v_home_player, v_away_player, v_deadline)
    on conflict (fixture_id, slot) do nothing;
  end loop;

  update public.league_lineups
    set status = 'REVEALED'
  where id in (v_home_lineup.id, v_away_lineup.id)
    and status = 'SUBMITTED';

  update public.league_fixtures
    set status = 'LINEUPS_REVEALED', revealed_at = now()
  where id = v_fixture.id;

  perform public.league_notify_team(
    v_fixture.home_team_id, 'LEAGUE_LINEUP_REVEALED',
    'League lineups revealed',
    'Both squads submitted their lineups. Your four duels are ready.',
    'league_fixture', v_fixture.id);
  perform public.league_notify_team(
    v_fixture.away_team_id, 'LEAGUE_LINEUP_REVEALED',
    'League lineups revealed',
    'Both squads submitted their lineups. Your four duels are ready.',
    'league_fixture', v_fixture.id);

  perform public.league_audit(
    v_fixture.season_id, 'LINEUPS_REVEALED', 'league_fixture', v_fixture.id,
    null, jsonb_build_object('revealed_at', now()), null);

  return true;
end;
$$;

create or replace function public.league_finalize_fixture(p_fixture_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fixture public.league_fixtures%rowtype;
  v_final_count int;
  v_home_wins int;
  v_away_wins int;
  v_home_points int;
  v_away_points int;
begin
  v_fixture := public.league_lock_fixture(p_fixture_id);

  if v_fixture.status in ('COMPLETED','FORFEITED','CANCELLED') then
    return true;
  end if;

  select count(*) into v_final_count
  from public.league_duels d
  where d.fixture_id = p_fixture_id
    and d.status in ('CONFIRMED','FORFEITED');

  if v_final_count < 4 then
    return false;
  end if;

  select
    count(*) filter (where d.winner_team_id = v_fixture.home_team_id),
    count(*) filter (where d.winner_team_id = v_fixture.away_team_id)
    into v_home_wins, v_away_wins
  from public.league_duels d
  where d.fixture_id = p_fixture_id
    and d.status in ('CONFIRMED','FORFEITED');

  v_home_points := case
    when v_home_wins > v_away_wins then 3
    when v_home_wins = v_away_wins then 1
    else 0 end;
  v_away_points := case
    when v_away_wins > v_home_wins then 3
    when v_away_wins = v_home_wins then 1
    else 0 end;

  update public.league_fixtures
    set status = 'COMPLETED',
        home_duel_wins = v_home_wins,
        away_duel_wins = v_away_wins,
        home_points = v_home_points,
        away_points = v_away_points,
        completed_at = now()
  where id = v_fixture.id;

  update public.league_matchdays m
    set status = 'COMPLETED'
  where m.id = v_fixture.matchday_id
    and m.status <> 'COMPLETED'
    and not exists (
      select 1 from public.league_fixtures f
      where f.matchday_id = m.id
        and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
    );

  perform public.league_notify_team(
    v_fixture.home_team_id, 'LEAGUE_RESULT_CONFIRMED',
    'League fixture finalized',
    'Your fixture is final: ' || v_home_wins || '-' || v_away_wins || ' duels.',
    'league_fixture', v_fixture.id);
  perform public.league_notify_team(
    v_fixture.away_team_id, 'LEAGUE_RESULT_CONFIRMED',
    'League fixture finalized',
    'Your fixture is final: ' || v_away_wins || '-' || v_home_wins || ' duels.',
    'league_fixture', v_fixture.id);

  perform public.league_audit(
    v_fixture.season_id, 'FIXTURE_FINALIZED', 'league_fixture', v_fixture.id,
    jsonb_build_object('status', v_fixture.status),
    jsonb_build_object(
      'status', 'COMPLETED', 'home_duel_wins', v_home_wins,
      'away_duel_wins', v_away_wins, 'home_points', v_home_points,
      'away_points', v_away_points),
    null);

  return true;
end;
$$;

-- ============================================================================
-- 5. Season and admin RPCs
-- ============================================================================

create or replace function public.league_create_season(
  p_name text,
  p_description text default null,
  p_registration_opens_at timestamptz default null,
  p_registration_closes_at timestamptz default null,
  p_starts_at timestamptz default null,
  p_matchday_days int default 7,
  p_min_teams int default 4,
  p_max_teams int default 8,
  p_roster_min int default 6,
  p_roster_max int default 8
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_admin();
  v_id uuid;
begin
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then
    raise exception 'Season name must be 2-80 characters.';
  end if;
  if p_description is not null and char_length(p_description) > 2000 then
    raise exception 'Season description is too long.';
  end if;
  if p_matchday_days not between 1 and 14 then
    raise exception 'Matchday length must be 1-14 days.';
  end if;
  if p_min_teams not between 4 and 16 or p_max_teams not between p_min_teams and 16 then
    raise exception 'Team limits must be 4-16 with max >= min.';
  end if;
  if p_roster_min not between 6 and 8 or p_roster_max not between p_roster_min and 8 then
    raise exception 'Roster limits must be 6-8 with max >= min.';
  end if;
  if p_registration_opens_at is not null and p_registration_closes_at is not null
     and p_registration_closes_at <= p_registration_opens_at then
    raise exception 'Registration close must be after registration open.';
  end if;
  if p_starts_at is not null and p_registration_closes_at is not null
     and p_starts_at < p_registration_closes_at then
    raise exception 'Season start must be at or after registration close.';
  end if;

  insert into public.league_seasons
    (name, description, registration_opens_at, registration_closes_at, starts_at,
     matchday_days, min_teams, max_teams, roster_min, roster_max, created_by)
  values
    (btrim(p_name), p_description, p_registration_opens_at, p_registration_closes_at,
     p_starts_at, p_matchday_days, p_min_teams, p_max_teams, p_roster_min,
     p_roster_max, v_me)
  returning id into v_id;

  perform public.league_audit(
    v_id, 'SEASON_CREATED', 'league_season', v_id, null,
    jsonb_build_object('name', btrim(p_name), 'status', 'DRAFT'), null);

  return v_id;
end;
$$;

create or replace function public.league_update_season(
  p_season_id uuid,
  p_name text,
  p_description text,
  p_registration_opens_at timestamptz,
  p_registration_closes_at timestamptz,
  p_starts_at timestamptz,
  p_matchday_days int,
  p_min_teams int,
  p_max_teams int,
  p_roster_min int,
  p_roster_max int
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
  v_team_count int;
begin
  perform public.league_require_admin();
  v_season := public.league_lock_season(p_season_id);

  if v_season.status not in ('DRAFT','REGISTRATION') then
    raise exception 'Only DRAFT or REGISTRATION seasons can be edited.';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then
    raise exception 'Season name must be 2-80 characters.';
  end if;
  if p_description is not null and char_length(p_description) > 2000 then
    raise exception 'Season description is too long.';
  end if;
  if p_matchday_days not between 1 and 14 then
    raise exception 'Matchday length must be 1-14 days.';
  end if;
  if p_min_teams not between 4 and 16 or p_max_teams not between p_min_teams and 16 then
    raise exception 'Team limits must be 4-16 with max >= min.';
  end if;
  if p_roster_min not between 6 and 8 or p_roster_max not between p_roster_min and 8 then
    raise exception 'Roster limits must be 6-8 with max >= min.';
  end if;
  if p_registration_opens_at is not null and p_registration_closes_at is not null
     and p_registration_closes_at <= p_registration_opens_at then
    raise exception 'Registration close must be after registration open.';
  end if;
  if p_starts_at is not null and p_registration_closes_at is not null
     and p_starts_at < p_registration_closes_at then
    raise exception 'Season start must be at or after registration close.';
  end if;

  if (p_starts_at is distinct from v_season.starts_at
      or p_matchday_days <> v_season.matchday_days)
     and exists (
       select 1 from public.league_matchdays m
       where m.season_id = p_season_id
     ) then
    raise exception 'Regenerate fixtures before changing the start or matchday length.';
  end if;

  select count(*) into v_team_count
  from public.league_teams t
  where t.season_id = p_season_id and t.status in ('PENDING','APPROVED');
  if v_team_count > p_max_teams then
    raise exception 'There are already % squads; max teams cannot be lower.', v_team_count;
  end if;

  if exists (
    select 1
    from public.league_teams t
    where t.season_id = p_season_id and t.status = 'APPROVED'
      and (select count(*) from public.league_team_members m
           where m.team_id = t.id and m.status = 'ACTIVE')
          not between p_roster_min and p_roster_max
  ) then
    raise exception 'An approved squad would fall outside the new roster limits.';
  end if;

  update public.league_seasons
    set name = btrim(p_name),
        description = p_description,
        registration_opens_at = p_registration_opens_at,
        registration_closes_at = p_registration_closes_at,
        starts_at = p_starts_at,
        matchday_days = p_matchday_days,
        min_teams = p_min_teams,
        max_teams = p_max_teams,
        roster_min = p_roster_min,
        roster_max = p_roster_max
  where id = p_season_id;

  perform public.league_audit(
    p_season_id, 'SEASON_UPDATED', 'league_season', p_season_id,
    jsonb_build_object(
      'name', v_season.name, 'starts_at', v_season.starts_at,
      'min_teams', v_season.min_teams, 'max_teams', v_season.max_teams,
      'roster_min', v_season.roster_min, 'roster_max', v_season.roster_max),
    jsonb_build_object(
      'name', btrim(p_name), 'starts_at', p_starts_at,
      'min_teams', p_min_teams, 'max_teams', p_max_teams,
      'roster_min', p_roster_min, 'roster_max', p_roster_max),
    null);
end;
$$;

create or replace function public.league_set_season_status(
  p_season_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
  v_target text := upper(coalesce(p_status, ''));
  v_teams int;
  v_expected_matchdays int;
  v_expected_fixtures int;
begin
  perform public.league_require_admin();
  v_season := public.league_lock_season(p_season_id);

  if v_target not in ('DRAFT','REGISTRATION','ACTIVE','COMPLETED','ARCHIVED') then
    raise exception 'Unknown league season status: %', p_status;
  end if;
  if v_season.status = v_target then
    return;
  end if;
  if not (
    (v_season.status = 'DRAFT' and v_target = 'REGISTRATION')
    or (v_season.status = 'REGISTRATION' and v_target = 'ACTIVE')
    or (v_season.status = 'ACTIVE' and v_target = 'COMPLETED')
    or (v_season.status = 'COMPLETED' and v_target = 'ARCHIVED')
  ) then
    raise exception 'Invalid league season transition: % -> %.', v_season.status, v_target;
  end if;

  if v_target = 'REGISTRATION' then
    if v_season.registration_closes_at is not null
       and v_season.registration_closes_at <= now() then
      raise exception 'Registration close must be in the future.';
    end if;
    update public.league_seasons
      set status = 'REGISTRATION',
          registration_opens_at = coalesce(registration_opens_at, now())
    where id = p_season_id;
  elsif v_target = 'ACTIVE' then
    select count(*) into v_teams
    from public.league_teams t
    where t.season_id = p_season_id and t.status = 'APPROVED';

    if v_teams < v_season.min_teams or v_teams > v_season.max_teams then
      raise exception 'An active season needs %-% approved squads (has %).',
        v_season.min_teams, v_season.max_teams, v_teams;
    end if;
    if v_season.starts_at is null then
      raise exception 'Set the season start before activating it.';
    end if;
    if exists (
      select 1 from public.league_teams t
      where t.season_id = p_season_id and t.status = 'APPROVED'
        and (select count(*) from public.league_team_members m
             where m.team_id = t.id and m.status = 'ACTIVE')
            not between v_season.roster_min and v_season.roster_max
    ) then
      raise exception 'Every approved squad must be within roster limits.';
    end if;

    v_expected_matchdays := case
      when mod(v_teams, 2) = 0 then 2 * (v_teams - 1)
      else 2 * v_teams end;
    v_expected_fixtures := v_teams * (v_teams - 1);

    if (select count(*) from public.league_matchdays m where m.season_id = p_season_id)
       <> v_expected_matchdays then
      raise exception 'Generate fixtures first: expected % matchdays.', v_expected_matchdays;
    end if;
    if (select count(*) from public.league_fixtures f where f.season_id = p_season_id)
       <> v_expected_fixtures then
      raise exception 'Generate fixtures first: expected % fixtures.', v_expected_fixtures;
    end if;

    update public.league_seasons set status = 'ACTIVE' where id = p_season_id;
  elsif v_target = 'COMPLETED' then
    if exists (
      select 1 from public.league_fixtures f
      where f.season_id = p_season_id
        and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
    ) then
      raise exception 'Every fixture must be final before the season is completed.';
    end if;
    update public.league_seasons set status = 'COMPLETED' where id = p_season_id;
    update public.league_matchdays set status = 'COMPLETED'
    where season_id = p_season_id and status <> 'COMPLETED';
  else
    update public.league_seasons set status = 'ARCHIVED' where id = p_season_id;
  end if;

  perform public.league_audit(
    p_season_id, 'SEASON_STATUS_CHANGED', 'league_season', p_season_id,
    jsonb_build_object('status', v_season.status),
    jsonb_build_object('status', v_target), p_reason);

  perform public.league_notify_season(
    p_season_id, 'LEAGUE_SEASON_STATUS',
    'League season updated',
    'The 4vs4 season is now ' || v_target || '.',
    'league_season', p_season_id);
end;
$$;

create or replace function public.league_generate_fixtures(
  p_season_id uuid,
  p_reset boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
  v_teams uuid[];
  v_team_count int;
  v_slots int;
  v_rounds int;
  v_total_matchdays int;
  v_matchday_ids uuid[] := '{}';
  v_md int;
  v_r int;
  v_i int;
  v_j int;
  v_a uuid;
  v_b uuid;
  v_home uuid;
  v_away uuid;
  v_bye uuid;
  v_last uuid;
  v_new_id uuid;
begin
  perform public.league_require_admin();
  v_season := public.league_lock_season(p_season_id);

  if v_season.status not in ('DRAFT','REGISTRATION','ACTIVE') then
    raise exception 'Fixtures cannot be generated for a % season.', v_season.status;
  end if;
  if v_season.starts_at is null then
    raise exception 'Set the season start before generating fixtures.';
  end if;

  select array_agg(t.id order by lower(t.name), t.id) into v_teams
  from public.league_teams t
  where t.season_id = p_season_id and t.status = 'APPROVED';

  v_team_count := coalesce(array_length(v_teams, 1), 0);
  if v_team_count < v_season.min_teams or v_team_count > v_season.max_teams then
    raise exception 'Fixture generation needs %-% approved squads (has %).',
      v_season.min_teams, v_season.max_teams, v_team_count;
  end if;

  if exists (select 1 from public.league_matchdays m where m.season_id = p_season_id)
     or exists (select 1 from public.league_fixtures f where f.season_id = p_season_id) then
    if not coalesce(p_reset, false) then
      raise exception 'Fixtures already exist. Pass p_reset = true to replace a clean schedule.';
    end if;
    if exists (
      select 1 from public.league_fixtures f
      where f.season_id = p_season_id and f.status <> 'SCHEDULED'
    ) or exists (
      select 1 from public.league_lineups l
      join public.league_fixtures f on f.id = l.fixture_id
      where f.season_id = p_season_id
    ) or exists (
      select 1 from public.league_duels d
      join public.league_fixtures f on f.id = d.fixture_id
      where f.season_id = p_season_id
    ) then
      raise exception 'A started or reported schedule cannot be reset.';
    end if;
    delete from public.league_matchdays where season_id = p_season_id;
  end if;

  if mod(v_team_count, 2) = 1 then
    v_teams := array_append(v_teams, null::uuid);
  end if;
  v_slots := array_length(v_teams, 1);
  v_rounds := v_slots - 1;
  v_total_matchdays := 2 * v_rounds;

  for v_md in 1..v_total_matchdays loop
    insert into public.league_matchdays
      (season_id, number, opens_at, deadline)
    values
      (p_season_id, v_md,
       v_season.starts_at + ((v_md - 1) * v_season.matchday_days) * interval '1 day',
       v_season.starts_at + (v_md * v_season.matchday_days) * interval '1 day')
    returning id into v_new_id;
    v_matchday_ids := array_append(v_matchday_ids, v_new_id);
  end loop;

  for v_r in 0..(v_rounds - 1) loop
    for v_i in 0..((v_slots / 2) - 1) loop
      v_a := v_teams[v_i + 1];
      v_b := v_teams[v_slots - v_i];

      if v_a is null then
        v_bye := v_b;
      elsif v_b is null then
        v_bye := v_a;
      else
        v_bye := null;
      end if;

      if v_bye is not null then
        insert into public.league_byes (season_id, matchday_id, team_id)
        values (p_season_id, v_matchday_ids[v_r + 1], v_bye)
        on conflict do nothing;
        insert into public.league_byes (season_id, matchday_id, team_id)
        values (p_season_id, v_matchday_ids[v_rounds + v_r + 1], v_bye)
        on conflict do nothing;
      else
        if mod(v_r + v_i, 2) = 0 then
          v_home := v_a;
          v_away := v_b;
        else
          v_home := v_b;
          v_away := v_a;
        end if;

        insert into public.league_fixtures
          (season_id, matchday_id, leg, home_team_id, away_team_id)
        values
          (p_season_id, v_matchday_ids[v_r + 1], 1, v_home, v_away);
        insert into public.league_fixtures
          (season_id, matchday_id, leg, home_team_id, away_team_id)
        values
          (p_season_id, v_matchday_ids[v_rounds + v_r + 1], 2, v_away, v_home);
      end if;
    end loop;

    v_last := v_teams[v_slots];
    for v_j in reverse 3..v_slots loop
      v_teams[v_j] := v_teams[v_j - 1];
    end loop;
    v_teams[2] := v_last;
  end loop;

  perform public.league_audit(
    p_season_id, 'FIXTURES_GENERATED', 'league_season', p_season_id,
    null,
    jsonb_build_object(
      'teams', v_team_count, 'matchdays', v_total_matchdays,
      'fixtures', v_team_count * (v_team_count - 1)),
    null);
end;
$$;

create or replace function public.league_extend_matchday(
  p_matchday_id uuid,
  p_new_deadline timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_matchday public.league_matchdays%rowtype;
  v_season_status text;
  r record;
begin
  perform public.league_require_admin();
  v_matchday := public.league_lock_matchday(p_matchday_id);
  select s.status into v_season_status
  from public.league_seasons s where s.id = v_matchday.season_id;

  if v_season_status not in ('REGISTRATION','ACTIVE') then
    raise exception 'Deadlines cannot be extended in a % season.', v_season_status;
  end if;
  if v_matchday.status = 'COMPLETED' then
    raise exception 'This matchday is already completed.';
  end if;
  if p_new_deadline is null or p_new_deadline <= v_matchday.deadline then
    raise exception 'The new deadline must extend the current deadline.';
  end if;
  if p_new_deadline <= v_matchday.opens_at then
    raise exception 'The deadline must be after the matchday opens.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;

  update public.league_matchdays
    set deadline = p_new_deadline,
        status = case
          when status = 'CLOSED' and p_new_deadline > now() then 'OPEN'
          else status end
  where id = p_matchday_id;

  update public.league_duels d
    set deadline = p_new_deadline
  from public.league_fixtures f
  where f.id = d.fixture_id
    and f.matchday_id = p_matchday_id
    and d.status not in ('CONFIRMED','FORFEITED','CANCELLED');

  for r in
    select distinct f.home_team_id as team_id from public.league_fixtures f
    where f.matchday_id = p_matchday_id
    union
    select distinct f.away_team_id from public.league_fixtures f
    where f.matchday_id = p_matchday_id
  loop
    perform public.league_notify_team(
      r.team_id, 'LEAGUE_MATCHDAY_EXTENDED',
      'League deadline extended',
      'Your matchday deadline was extended to ' || p_new_deadline::text || '.',
      'league_matchday', p_matchday_id);
  end loop;

  perform public.league_audit(
    v_matchday.season_id, 'MATCHDAY_EXTENDED', 'league_matchday', p_matchday_id,
    jsonb_build_object('deadline', v_matchday.deadline),
    jsonb_build_object('deadline', p_new_deadline), p_reason);
end;
$$;

create or replace function public.league_approve_team(
  p_team_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_admin();
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_approved int;
  v_roster int;
begin
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Squads can only be approved during registration.';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Admin note is too long.';
  end if;
  if p_approve is null then
    raise exception 'Choose whether to approve or reject the squad.';
  end if;
  if (p_approve and v_team.status = 'APPROVED')
     or (not p_approve and v_team.status = 'REJECTED') then
    return;
  end if;
  if v_team.status <> 'PENDING' then
    raise exception 'Only PENDING squads can be reviewed.';
  end if;

  if p_approve then
    select count(*) into v_approved
    from public.league_teams t
    where t.season_id = v_team.season_id and t.status = 'APPROVED';
    if v_approved >= v_season.max_teams then
      raise exception 'This season already has the maximum number of approved squads.';
    end if;

    select count(*) into v_roster
    from public.league_team_members m
    where m.team_id = p_team_id and m.status = 'ACTIVE';
    if v_roster not between v_season.roster_min and v_season.roster_max then
      raise exception 'The squad must have %-% active players before approval.',
        v_season.roster_min, v_season.roster_max;
    end if;

    update public.league_teams
      set status = 'APPROVED', approved_by = v_me, approved_at = now(),
          admin_note = p_note
    where id = p_team_id;

    perform public.league_notify_team(
      p_team_id, 'LEAGUE_TEAM_APPROVED',
      'League squad approved',
      'Your 4vs4 squad is approved for the season.',
      'league_team', p_team_id);
  else
    perform public.league_notify_team(
      p_team_id, 'LEAGUE_TEAM_REJECTED',
      'League squad rejected',
      coalesce('Your 4vs4 squad was rejected. ' || nullif(p_note, ''), 'Your 4vs4 squad was rejected.'),
      'league_team', p_team_id);

    update public.league_teams
      set status = 'REJECTED', approved_by = v_me, approved_at = now(),
          admin_note = p_note
    where id = p_team_id;

    update public.league_team_members
      set status = 'LEFT', left_at = now()
    where team_id = p_team_id and status = 'ACTIVE';

    update public.league_team_invites
      set status = 'REVOKED', responded_at = now()
    where team_id = p_team_id and status = 'PENDING';
  end if;

  perform public.league_audit(
    v_team.season_id, 'TEAM_REVIEWED', 'league_team', p_team_id,
    jsonb_build_object('status', v_team.status),
    jsonb_build_object('status', case when p_approve then 'APPROVED' else 'REJECTED' end),
    p_note);
end;
$$;

create or replace function public.league_replace_member(
  p_team_id uuid,
  p_out_player_id uuid,
  p_in_player_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_out public.league_team_members%rowtype;
  v_role text;
begin
  perform public.league_require_admin();
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status not in ('REGISTRATION','ACTIVE') then
    raise exception 'Members cannot be replaced in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'Members cannot be replaced on a % squad.', v_team.status;
  end if;
  if v_season.status = 'ACTIVE' and exists (
    select 1 from public.league_matchdays m
    where m.season_id = v_team.season_id
      and m.status <> 'COMPLETED'
      and now() >= m.opens_at and now() < m.deadline
  ) then
    raise exception 'Replacements must be completed between matchdays.';
  end if;
  if p_out_player_id = p_in_player_id then
    raise exception 'Choose a different replacement player.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;

  select * into v_out
  from public.league_team_members m
  where m.team_id = p_team_id and m.player_id = p_out_player_id
    and m.status = 'ACTIVE'
  for update;
  if v_out.id is null then
    raise exception 'The outgoing player is not an active squad member.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_in_player_id and p.status = 'ACTIVE'
  ) then
    raise exception 'The replacement must be an ACTIVE clan member.';
  end if;
  if exists (
    select 1 from public.league_team_members m
    where m.season_id = v_team.season_id and m.player_id = p_in_player_id
      and m.status = 'ACTIVE'
  ) then
    raise exception 'The replacement already has an active squad this season.';
  end if;
  if exists (
    select 1 from public.league_duels d
    where (d.home_player_id = p_out_player_id or d.away_player_id = p_out_player_id)
      and d.status not in ('CONFIRMED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Resolve or substitute the outgoing player''s open duel first.';
  end if;
  if exists (
    select 1
    from public.league_lineup_players lp
    join public.league_lineups l on l.id = lp.lineup_id
    join public.league_fixtures f on f.id = l.fixture_id
    where l.team_id = p_team_id and lp.player_id = p_out_player_id
      and l.status in ('SUBMITTED','REVEALED')
      and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Update the submitted lineup before replacing this player.';
  end if;

  v_role := case when v_out.role = 'CAPTAIN' then 'CAPTAIN' else 'PLAYER' end;

  update public.league_team_members
    set status = 'REPLACED', left_at = now(),
        replaced_by = p_in_player_id, replaced_at = now()
  where id = v_out.id;

  insert into public.league_team_members
    (season_id, team_id, player_id, role, status)
  values
    (v_team.season_id, p_team_id, p_in_player_id, v_role, 'ACTIVE');

  update public.league_team_invites
    set status = 'ACCEPTED', responded_at = now()
  where team_id = p_team_id and player_id = p_in_player_id and status = 'PENDING';

  if v_out.role = 'CAPTAIN' then
    update public.league_teams
      set captain_id = p_in_player_id
    where id = p_team_id;
  end if;

  perform public.league_notify(
    p_out_player_id, 'LEAGUE_ROSTER_CHANGED',
    'League squad changed',
    'You were replaced in your 4vs4 squad.',
    'league_team', p_team_id);
  perform public.league_notify(
    p_in_player_id, 'LEAGUE_ROSTER_CHANGED',
    'League squad changed',
    'You joined a 4vs4 squad as a replacement.',
    'league_team', p_team_id);

  perform public.league_audit(
    v_team.season_id, 'MEMBER_REPLACED', 'league_team', p_team_id,
    jsonb_build_object('out_player_id', p_out_player_id, 'role', v_out.role),
    jsonb_build_object('in_player_id', p_in_player_id, 'role', v_role),
    p_reason);
end;
$$;

create or replace function public.league_apply_penalty(
  p_season_id uuid,
  p_team_id uuid,
  p_points int,
  p_reason text,
  p_matchday_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_admin();
  v_season public.league_seasons%rowtype;
  v_team public.league_teams%rowtype;
  v_id uuid;
  v_team_name text;
begin
  v_season := public.league_lock_season(p_season_id);

  if v_season.status = 'ARCHIVED' then
    raise exception 'Archived seasons cannot be penalized.';
  end if;
  if p_points is null or p_points = 0 or p_points not between -100 and 100 then
    raise exception 'Penalty points must be a non-zero value between -100 and 100.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;

  select * into v_team from public.league_teams t
  where t.id = p_team_id and t.season_id = p_season_id;
  if v_team.id is null then
    raise exception 'Squad is not part of this season.';
  end if;
  v_team_name := v_team.name;

  if p_matchday_id is not null and not exists (
    select 1 from public.league_matchdays m
    where m.id = p_matchday_id and m.season_id = p_season_id
  ) then
    raise exception 'Matchday is not part of this season.';
  end if;

  insert into public.league_penalties
    (season_id, team_id, matchday_id, points, reason, created_by)
  values
    (p_season_id, p_team_id, p_matchday_id, p_points, btrim(p_reason), v_me)
  returning id into v_id;

  perform public.league_notify_team(
    p_team_id, 'LEAGUE_SANCTION',
    'League sanction',
    v_team_name || ' received a ' || p_points || ' point adjustment: ' || btrim(p_reason),
    'league_team', p_team_id);

  perform public.league_audit(
    p_season_id, 'PENALTY_APPLIED', 'league_team', p_team_id,
    null, jsonb_build_object('points', p_points, 'matchday_id', p_matchday_id),
    p_reason);

  return v_id;
end;
$$;

create or replace function public.league_set_tiebreak_order(
  p_season_id uuid,
  p_team_ids uuid[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_admin();
  v_season public.league_seasons%rowtype;
  v_count int;
  v_match int;
  v_old jsonb;
  v_i int;
begin
  v_season := public.league_lock_season(p_season_id);

  if v_season.status not in ('ACTIVE','COMPLETED') then
    raise exception 'Tiebreak order can only be set for an active or completed season.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;
  if p_team_ids is null or array_length(p_team_ids, 1) is null then
    raise exception 'Provide the ordered squad ids.';
  end if;

  v_count := array_length(p_team_ids, 1);
  if array_position(p_team_ids, null) is not null then
    raise exception 'Tiebreak order cannot contain null ids.';
  end if;
  if (select count(distinct x) from unnest(p_team_ids) x) <> v_count then
    raise exception 'Tiebreak order contains duplicate squads.';
  end if;
  if v_count <> (
    select count(*) from public.league_teams t
    where t.season_id = p_season_id and t.status = 'APPROVED'
  ) then
    raise exception 'Tiebreak order must include every approved squad.';
  end if;

  select count(*) into v_match
  from public.league_teams t
  where t.season_id = p_season_id and t.status = 'APPROVED'
    and t.id = any(p_team_ids);
  if v_match <> v_count then
    raise exception 'Tiebreak order contains a squad outside this season.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('team_id', o.team_id, 'position', o.position)), '[]'::jsonb)
    into v_old
  from public.league_tiebreak_orders o
  where o.season_id = p_season_id;

  delete from public.league_tiebreak_orders where season_id = p_season_id;
  for v_i in 1..v_count loop
    insert into public.league_tiebreak_orders
      (season_id, team_id, position, reason, created_by)
    values
      (p_season_id, p_team_ids[v_i], v_i, btrim(p_reason), v_me);
  end loop;

  perform public.league_audit(
    p_season_id, 'TIEBREAK_ORDER_SET', 'league_season', p_season_id,
    v_old, jsonb_build_object('team_ids', p_team_ids), p_reason);
end;
$$;

-- ============================================================================
-- 6. Team, roster and roster-admin RPCs
-- ============================================================================

create or replace function public.league_create_team(
  p_season_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season public.league_seasons%rowtype;
  v_active_teams int;
  v_id uuid;
begin
  v_season := public.league_lock_season(p_season_id);

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Squads can only be created during registration.';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 40 then
    raise exception 'Squad name must be 2-40 characters.';
  end if;
  if exists (
    select 1 from public.league_teams t
    where t.season_id = p_season_id and lower(t.name) = lower(btrim(p_name))
  ) then
    raise exception 'That squad name is already in use this season.';
  end if;
  if exists (
    select 1 from public.league_team_members m
    where m.season_id = p_season_id and m.player_id = v_me and m.status = 'ACTIVE'
  ) then
    raise exception 'You already have an active squad this season.';
  end if;

  select count(*) into v_active_teams
  from public.league_teams t
  where t.season_id = p_season_id and t.status in ('PENDING','APPROVED');
  if v_active_teams >= v_season.max_teams then
    raise exception 'This season already has the maximum number of squads.';
  end if;

  insert into public.league_teams (season_id, name, captain_id, status)
  values (p_season_id, btrim(p_name), v_me, 'PENDING')
  returning id into v_id;

  insert into public.league_team_members
    (season_id, team_id, player_id, role, status)
  values
    (p_season_id, v_id, v_me, 'CAPTAIN', 'ACTIVE');

  perform public.league_audit(
    p_season_id, 'TEAM_CREATED', 'league_team', v_id, null,
    jsonb_build_object('name', btrim(p_name), 'captain_id', v_me), null);

  return v_id;
end;
$$;

create or replace function public.league_update_team(
  p_team_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
begin
  perform public.league_require_captain(p_team_id);
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status not in ('REGISTRATION','ACTIVE') then
    raise exception 'Squad details cannot be edited in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad can no longer be edited.';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 40 then
    raise exception 'Squad name must be 2-40 characters.';
  end if;
  if exists (
    select 1 from public.league_teams t
    where t.season_id = v_team.season_id and t.id <> p_team_id
      and lower(t.name) = lower(btrim(p_name))
  ) then
    raise exception 'That squad name is already in use this season.';
  end if;

  update public.league_teams set name = btrim(p_name) where id = p_team_id;

  perform public.league_audit(
    v_team.season_id, 'TEAM_UPDATED', 'league_team', p_team_id,
    jsonb_build_object('name', v_team.name),
    jsonb_build_object('name', btrim(p_name)), null);
end;
$$;

create or replace function public.league_invite_member(
  p_team_id uuid,
  p_player_id uuid,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_captain(p_team_id);
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_active int;
  v_id uuid;
begin
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Invites are closed in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad can no longer invite players.';
  end if;
  if p_player_id = v_me then
    raise exception 'You cannot invite yourself.';
  end if;
  if p_message is not null and char_length(p_message) > 500 then
    raise exception 'Invite message is too long.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_player_id and p.status = 'ACTIVE'
  ) then
    raise exception 'You can only invite ACTIVE clan members.';
  end if;
  if exists (
    select 1 from public.league_team_members m
    where m.season_id = v_team.season_id and m.player_id = p_player_id
      and m.status = 'ACTIVE'
  ) then
    raise exception 'That player already has an active squad this season.';
  end if;

  update public.league_team_invites
    set status = 'EXPIRED', responded_at = now()
  where team_id = p_team_id and player_id = p_player_id
    and status = 'PENDING' and expires_at is not null and expires_at <= now();

  if exists (
    select 1 from public.league_team_invites i
    where i.team_id = p_team_id and i.player_id = p_player_id
      and i.status = 'PENDING'
  ) then
    raise exception 'That player already has a pending invite from this squad.';
  end if;

  select count(*) into v_active
  from public.league_team_members m
  where m.team_id = p_team_id and m.status = 'ACTIVE';
  if v_active >= v_season.roster_max then
    raise exception 'Your squad is already full (max % players).', v_season.roster_max;
  end if;

  insert into public.league_team_invites
    (season_id, team_id, player_id, invited_by, message, expires_at)
  values
    (v_team.season_id, p_team_id, p_player_id, v_me, nullif(btrim(p_message), ''),
     now() + interval '7 days')
  returning id into v_id;

  perform public.league_notify(
    p_player_id, 'LEAGUE_INVITE',
    '4vs4 squad invite',
    'You were invited to join ' || v_team.name || '.',
    'league_team', p_team_id);

  perform public.league_audit(
    v_team.season_id, 'INVITE_SENT', 'league_team', p_team_id, null,
    jsonb_build_object('player_id', p_player_id, 'invite_id', v_id), null);

  return v_id;
end;
$$;

create or replace function public.league_answer_invite(
  p_invite_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_invite public.league_team_invites%rowtype;
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_active int;
begin
  select * into v_invite
  from public.league_team_invites i
  where i.id = p_invite_id;
  if v_invite.id is null then
    raise exception 'Invite not found.';
  end if;
  if v_invite.player_id <> v_me then
    raise exception 'This invite belongs to another player.';
  end if;

  v_season := public.league_lock_season(v_invite.season_id);
  v_team := public.league_lock_team(v_invite.team_id);

  select * into v_invite
  from public.league_team_invites i
  where i.id = p_invite_id
  for update;
  if v_invite.player_id <> v_me then
    raise exception 'This invite belongs to another player.';
  end if;
  if v_invite.status <> 'PENDING' then
    raise exception 'This invite is no longer pending.';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'This invite has expired.';
  end if;

  if not coalesce(p_accept, false) then
    update public.league_team_invites
      set status = 'DECLINED', responded_at = now()
    where id = p_invite_id;
    perform public.league_audit(
      v_team.season_id, 'INVITE_DECLINED', 'league_team', v_team.id, null,
      jsonb_build_object('player_id', v_me, 'invite_id', p_invite_id), null);
    return;
  end if;

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Invites cannot be accepted in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad can no longer accept players.';
  end if;
  if exists (
    select 1 from public.league_team_members m
    where m.season_id = v_team.season_id and m.player_id = v_me
      and m.status = 'ACTIVE'
  ) then
    raise exception 'You already have an active squad this season.';
  end if;

  select count(*) into v_active
  from public.league_team_members m
  where m.team_id = v_team.id and m.status = 'ACTIVE';
  if v_active >= v_season.roster_max then
    raise exception 'This squad is already full.';
  end if;

  update public.league_team_invites
    set status = 'ACCEPTED', responded_at = now()
  where id = p_invite_id;

  insert into public.league_team_members
    (season_id, team_id, player_id, role, status)
  values
    (v_team.season_id, v_team.id, v_me, 'PLAYER', 'ACTIVE');

  perform public.league_notify(
    v_team.captain_id, 'LEAGUE_ROSTER_CHANGED',
    'League squad changed',
    'A player accepted your 4vs4 squad invite.',
    'league_team', v_team.id);

  perform public.league_audit(
    v_team.season_id, 'INVITE_ACCEPTED', 'league_team', v_team.id, null,
    jsonb_build_object('player_id', v_me, 'invite_id', p_invite_id), null);
end;
$$;

create or replace function public.league_leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_member public.league_team_members%rowtype;
  v_active int;
begin
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Rosters are locked; contact an admin for a replacement.';
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad is no longer active.';
  end if;

  select * into v_member
  from public.league_team_members m
  where m.team_id = p_team_id and m.player_id = v_me and m.status = 'ACTIVE'
  for update;
  if v_member.id is null then
    raise exception 'You are not an active member of this squad.';
  end if;
  if exists (
    select 1 from public.league_duels d
    where (d.home_player_id = v_me or d.away_player_id = v_me)
      and d.status not in ('CONFIRMED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Resolve or substitute your open duel before leaving.';
  end if;
  if exists (
    select 1
    from public.league_lineup_players lp
    join public.league_lineups l on l.id = lp.lineup_id
    join public.league_fixtures f on f.id = l.fixture_id
    where l.team_id = p_team_id and lp.player_id = v_me
      and l.status in ('SUBMITTED','REVEALED')
      and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Ask your captain to update the submitted lineup first.';
  end if;

  select count(*) into v_active
  from public.league_team_members m
  where m.team_id = p_team_id and m.status = 'ACTIVE';

  if v_member.role = 'CAPTAIN' then
    if v_active > 1 then
      raise exception 'Transfer the captaincy before leaving the squad.';
    end if;

    perform public.league_notify_team(
      p_team_id, 'LEAGUE_TEAM_WITHDRAWN',
      'League squad withdrawn',
      v_team.name || ' withdrew from the season.',
      'league_team', p_team_id);

    update public.league_teams set status = 'WITHDRAWN' where id = p_team_id;
    update public.league_team_invites
      set status = 'REVOKED', responded_at = now()
    where team_id = p_team_id and status = 'PENDING';
  end if;

  update public.league_team_members
    set status = 'LEFT', left_at = now()
  where id = v_member.id;

  if v_member.role <> 'CAPTAIN' then
    perform public.league_notify(
      v_team.captain_id, 'LEAGUE_ROSTER_CHANGED',
      'League squad changed',
      'A player left your 4vs4 squad.',
      'league_team', p_team_id);
  end if;

  perform public.league_audit(
    v_team.season_id, 'MEMBER_LEFT', 'league_team', p_team_id,
    jsonb_build_object('player_id', v_me, 'role', v_member.role), null, null);
end;
$$;

create or replace function public.league_remove_member(
  p_team_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_member public.league_team_members%rowtype;
begin
  perform public.league_require_captain(p_team_id);
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Rosters are locked; contact an admin for a replacement.';
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad is no longer active.';
  end if;
  if p_player_id = v_team.captain_id then
    raise exception 'The captain cannot remove themselves.';
  end if;

  select * into v_member
  from public.league_team_members m
  where m.team_id = p_team_id and m.player_id = p_player_id and m.status = 'ACTIVE'
  for update;
  if v_member.id is null then
    raise exception 'That player is not an active squad member.';
  end if;
  if exists (
    select 1 from public.league_duels d
    where (d.home_player_id = p_player_id or d.away_player_id = p_player_id)
      and d.status not in ('CONFIRMED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Resolve or substitute the player''s open duel first.';
  end if;
  if exists (
    select 1
    from public.league_lineup_players lp
    join public.league_lineups l on l.id = lp.lineup_id
    join public.league_fixtures f on f.id = l.fixture_id
    where l.team_id = p_team_id and lp.player_id = p_player_id
      and l.status in ('SUBMITTED','REVEALED')
      and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Update the submitted lineup before removing this player.';
  end if;

  update public.league_team_members
    set status = 'REMOVED', left_at = now()
  where id = v_member.id;

  perform public.league_notify(
    p_player_id, 'LEAGUE_ROSTER_CHANGED',
    'League squad changed',
    'You were removed from your 4vs4 squad.',
    'league_team', p_team_id);

  perform public.league_audit(
    v_team.season_id, 'MEMBER_REMOVED', 'league_team', p_team_id,
    jsonb_build_object('player_id', p_player_id), null, null);
end;
$$;

create or replace function public.league_transfer_captain(
  p_team_id uuid,
  p_new_captain_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_new public.league_team_members%rowtype;
begin
  perform public.league_require_captain(p_team_id);
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status not in ('REGISTRATION','ACTIVE') then
    raise exception 'Captaincy cannot change in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad is no longer active.';
  end if;
  if p_new_captain_id = v_team.captain_id then
    raise exception 'That player is already the captain.';
  end if;

  select * into v_new
  from public.league_team_members m
  where m.team_id = p_team_id and m.player_id = p_new_captain_id
    and m.status = 'ACTIVE'
  for update;
  if v_new.id is null then
    raise exception 'The new captain must be an active squad member.';
  end if;

  update public.league_team_members
    set role = 'PLAYER'
  where team_id = p_team_id and player_id = v_team.captain_id and status = 'ACTIVE';
  update public.league_team_members
    set role = 'CAPTAIN'
  where id = v_new.id;
  update public.league_teams
    set captain_id = p_new_captain_id
  where id = p_team_id;

  perform public.league_notify(
    p_new_captain_id, 'LEAGUE_CAPTAIN_CHANGED',
    'League captaincy changed',
    'You are now the captain of ' || v_team.name || '.',
    'league_team', p_team_id);
  perform public.league_notify(
    v_team.captain_id, 'LEAGUE_CAPTAIN_CHANGED',
    'League captaincy changed',
    'Your 4vs4 squad has a new captain.',
    'league_team', p_team_id);

  perform public.league_audit(
    v_team.season_id, 'CAPTAIN_TRANSFERRED', 'league_team', p_team_id,
    jsonb_build_object('captain_id', v_team.captain_id),
    jsonb_build_object('captain_id', p_new_captain_id), null);
end;
$$;

-- ============================================================================
-- 7. Lineup and duel RPCs
-- ============================================================================

create or replace function public.league_submit_lineup(
  p_fixture_id uuid,
  p_players jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_matchday public.league_matchdays%rowtype;
  v_team_id uuid;
  v_lineup public.league_lineups%rowtype;
  v_starters int;
  v_subs int;
begin
  select f.season_id into v_season_id
  from public.league_fixtures f where f.id = p_fixture_id;
  if v_season_id is null then
    raise exception 'League fixture not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(p_fixture_id);
  select * into v_matchday from public.league_matchdays m
  where m.id = v_fixture.matchday_id;

  if v_season.status <> 'ACTIVE' then
    raise exception 'Lineups can only be submitted in an active season.';
  end if;
  if v_fixture.status not in ('SCHEDULED','LINEUPS_PENDING') then
    raise exception 'This fixture is no longer accepting lineups.';
  end if;
  if now() > v_matchday.deadline or v_matchday.status in ('CLOSED','COMPLETED') then
    raise exception 'The matchday deadline has passed.';
  end if;

  select t.id into v_team_id
  from public.league_teams t
  where t.id in (v_fixture.home_team_id, v_fixture.away_team_id)
    and t.captain_id = v_me and t.status = 'APPROVED';
  if v_team_id is null then
    raise exception 'Only the squad captain can submit this lineup.';
  end if;

  if p_players is null or jsonb_typeof(p_players) <> 'array' then
    raise exception 'Lineup must be a JSON array.';
  end if;
  if jsonb_array_length(p_players) not between 6 and 8 then
    raise exception 'Lineup must contain 6-8 players (4 starters, 2-4 substitutes).';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_players) e
    where jsonb_typeof(e) <> 'object'
      or e->>'player_id' is null
      or e->>'role' is null
      or e->>'role' not in ('STARTER','SUB')
      or e->>'slot' is null
      or (e->>'slot') !~ '^[1-4]$'
  ) then
    raise exception 'Every lineup entry needs player_id, role (STARTER/SUB) and slot 1-4.';
  end if;

  select
    count(*) filter (where e->>'role' = 'STARTER'),
    count(*) filter (where e->>'role' = 'SUB')
    into v_starters, v_subs
  from jsonb_array_elements(p_players) e;
  if v_starters <> 4 then
    raise exception 'A league lineup needs exactly 4 starters.';
  end if;
  if v_subs not between 2 and 4 then
    raise exception 'A league lineup needs 2-4 substitutes.';
  end if;

  if (select count(*) from jsonb_array_elements(p_players) e)
     <> (select count(distinct e->>'player_id') from jsonb_array_elements(p_players) e) then
    raise exception 'A player cannot appear twice in the lineup.';
  end if;
  if (select count(*) from jsonb_array_elements(p_players) e)
     <> (select count(distinct (e->>'role') || ':' || (e->>'slot'))
         from jsonb_array_elements(p_players) e) then
    raise exception 'Each lineup role and slot can only be used once.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_players) e
    where not exists (
      select 1 from public.league_team_members m
      where m.team_id = v_team_id
        and m.player_id = (e->>'player_id')::uuid
        and m.status = 'ACTIVE'
    )
  ) then
    raise exception 'Every lineup player must be an ACTIVE squad member.';
  end if;

  select * into v_lineup
  from public.league_lineups l
  where l.fixture_id = p_fixture_id and l.team_id = v_team_id
  for update;

  if v_lineup.id is null then
    insert into public.league_lineups
      (fixture_id, team_id, submitted_by, version, status)
    values
      (p_fixture_id, v_team_id, v_me, 1, 'DRAFT')
    returning * into v_lineup;
  elsif v_lineup.status in ('REVEALED','LOCKED') then
    raise exception 'This lineup is locked and can no longer be changed.';
  else
    update public.league_lineups
      set status = 'DRAFT'
    where id = v_lineup.id;
    delete from public.league_lineup_players where lineup_id = v_lineup.id;
  end if;

  insert into public.league_lineup_players (lineup_id, player_id, role, slot)
  select v_lineup.id, (e->>'player_id')::uuid, e->>'role', (e->>'slot')::int
  from jsonb_array_elements(p_players) e;

  update public.league_lineups
    set status = 'SUBMITTED',
        submitted_by = v_me,
        submitted_at = now(),
        version = version + 1
  where id = v_lineup.id;

  perform public.league_maybe_reveal_fixture(p_fixture_id);

  perform public.league_notify_team(
    (case when v_fixture.home_team_id = v_team_id
      then v_fixture.away_team_id else v_fixture.home_team_id end),
    'LEAGUE_LINEUP_SUBMITTED',
    'League lineup submitted',
    'Your opponent has submitted their lineup.',
    'league_fixture', p_fixture_id);

  perform public.league_audit(
    v_season_id, 'LINEUP_SUBMITTED', 'league_fixture', p_fixture_id,
    null, jsonb_build_object('team_id', v_team_id, 'players', jsonb_array_length(p_players)),
    null);
end;
$$;

create or replace function public.league_start_duel(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_fixture_id uuid;
  v_opponent uuid;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
begin
  select f.season_id, d.fixture_id into v_season_id, v_fixture_id
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where d.id = p_duel_id;
  if v_season_id is null then
    raise exception 'League duel not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(p_duel_id);

  if v_season.status <> 'ACTIVE' then
    raise exception 'Duels can only be played in an active season.';
  end if;
  if v_fixture.status not in ('LINEUPS_REVEALED','IN_PROGRESS') then
    raise exception 'This fixture is not ready for duels.';
  end if;
  if v_me = v_duel.home_player_id then
    v_opponent := v_duel.away_player_id;
    if not public.league_is_team_member(v_duel.home_team_id, v_me) then
      raise exception 'You are no longer an active member of this squad.';
    end if;
  elsif v_me = v_duel.away_player_id then
    v_opponent := v_duel.home_player_id;
    if not public.league_is_team_member(v_duel.away_team_id, v_me) then
      raise exception 'You are no longer an active member of this squad.';
    end if;
  else
    raise exception 'Only the assigned duel players can start this duel.';
  end if;
  if v_duel.status = 'STARTED' then
    return;
  end if;
  if v_duel.status <> 'SCHEDULED' then
    raise exception 'This duel can no longer be started.';
  end if;
  if now() > v_duel.deadline then
    raise exception 'The duel deadline has passed.';
  end if;

  update public.league_duels
    set status = 'STARTED', started_at = now()
  where id = p_duel_id;
  update public.league_fixtures
    set status = 'IN_PROGRESS'
  where id = v_fixture.id and status = 'LINEUPS_REVEALED';

  perform public.league_notify(
    v_opponent, 'LEAGUE_DUEL_STARTED',
    'League duel started',
    'Your opponent started your 4vs4 duel.',
    'league_duel', p_duel_id);

  perform public.league_audit(
    v_season_id, 'DUEL_STARTED', 'league_duel', p_duel_id, null, null, null);
end;
$$;

create or replace function public.league_substitute_player(
  p_duel_id uuid,
  p_out_player_id uuid,
  p_in_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_fixture_id uuid;
  v_team_id uuid;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
begin
  select f.season_id, d.fixture_id into v_season_id, v_fixture_id
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where d.id = p_duel_id;
  if v_season_id is null then
    raise exception 'League duel not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(p_duel_id);

  if v_season.status <> 'ACTIVE' then
    raise exception 'Substitutions are only available in an active season.';
  end if;
  if v_fixture.status not in ('LINEUPS_REVEALED','IN_PROGRESS') then
    raise exception 'This fixture is not accepting substitutions.';
  end if;
  if v_duel.status <> 'SCHEDULED' then
    raise exception 'This duel can no longer be substituted.';
  end if;
  if now() > v_duel.deadline then
    raise exception 'The duel deadline has passed.';
  end if;
  if p_out_player_id = p_in_player_id then
    raise exception 'Choose a different substitute.';
  end if;

  if v_duel.home_player_id = p_out_player_id then
    v_team_id := v_duel.home_team_id;
  elsif v_duel.away_player_id = p_out_player_id then
    v_team_id := v_duel.away_team_id;
  else
    raise exception 'The outgoing player is not assigned to this duel.';
  end if;

  if not exists (
    select 1 from public.league_teams t
    where t.id = v_team_id and t.captain_id = v_me and t.status = 'APPROVED'
  ) then
    raise exception 'Only the affected squad captain can request a substitution.';
  end if;
  if v_duel.started_at is not null then
    raise exception 'Substitutions are locked after the duel starts.';
  end if;
  if exists (select 1 from public.league_duel_reports r where r.duel_id = p_duel_id) then
    raise exception 'Substitutions are locked after a result is reported.';
  end if;
  if exists (
    select 1 from public.league_duels d
    where d.fixture_id = v_duel.fixture_id
      and (d.home_player_id = p_in_player_id or d.away_player_id = p_in_player_id)
  ) then
    raise exception 'That substitute is already assigned to a duel this fixture.';
  end if;
  if not exists (
    select 1 from public.league_team_members m
    where m.team_id = v_team_id and m.player_id = p_in_player_id
      and m.status = 'ACTIVE'
  ) then
    raise exception 'The substitute must be an ACTIVE squad member.';
  end if;
  if not exists (
    select 1
    from public.league_lineup_players lp
    join public.league_lineups l on l.id = lp.lineup_id
    where l.fixture_id = v_duel.fixture_id and l.team_id = v_team_id
      and lp.player_id = p_in_player_id and lp.role = 'SUB'
  ) then
    raise exception 'The substitute must be on the bench for this fixture.';
  end if;

  insert into public.league_substitutions
    (duel_id, fixture_id, team_id, out_player_id, in_player_id, requested_by)
  values
    (p_duel_id, v_duel.fixture_id, v_team_id, p_out_player_id, p_in_player_id, v_me);

  if v_team_id = v_duel.home_team_id then
    update public.league_duels set home_player_id = p_in_player_id where id = p_duel_id;
  else
    update public.league_duels set away_player_id = p_in_player_id where id = p_duel_id;
  end if;

  perform public.league_notify(
    p_out_player_id, 'LEAGUE_SUBSTITUTION',
    'League substitution',
    'You were substituted out of your 4vs4 duel.',
    'league_duel', p_duel_id);
  perform public.league_notify(
    p_in_player_id, 'LEAGUE_SUBSTITUTION',
    'League substitution',
    'You were substituted into a 4vs4 duel.',
    'league_duel', p_duel_id);

  perform public.league_audit(
    v_season_id, 'SUBSTITUTION', 'league_duel', p_duel_id,
    jsonb_build_object('out_player_id', p_out_player_id),
    jsonb_build_object('in_player_id', p_in_player_id), null);
end;
$$;

create or replace function public.league_submit_duel_result(
  p_duel_id uuid,
  p_score_for int,
  p_score_against int,
  p_decided_by text,
  p_evidence_path text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_fixture_id uuid;
  v_side text;
  v_team_id uuid;
  v_opponent_player uuid;
  v_home_score int;
  v_away_score int;
  v_winner uuid;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
  v_report public.league_duel_reports%rowtype;
  v_opponent_report public.league_duel_reports%rowtype;
begin
  select f.season_id, d.fixture_id into v_season_id, v_fixture_id
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where d.id = p_duel_id;
  if v_season_id is null then
    raise exception 'League duel not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(p_duel_id);

  if v_season.status <> 'ACTIVE' then
    raise exception 'Results can only be reported in an active season.';
  end if;
  if v_fixture.status not in ('LINEUPS_REVEALED','IN_PROGRESS') then
    raise exception 'This fixture is not accepting results.';
  end if;
  if v_duel.status not in ('STARTED','AWAITING_RESULTS') then
    raise exception 'This duel is not accepting results (status %).', v_duel.status;
  end if;
  if p_score_for is null or p_score_for not between 0 and 99
     or p_score_against is null or p_score_against not between 0 and 99 then
    raise exception 'Scores must be between 0 and 99.';
  end if;
  if p_score_for = p_score_against then
    raise exception 'Duel scores must be decisive.';
  end if;
  if p_decided_by is null or upper(p_decided_by) not in ('REGULATION','EXTRA_TIME','PENALTIES') then
    raise exception 'Decided by must be REGULATION, EXTRA_TIME or PENALTIES.';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Result note is too long.';
  end if;
  perform public.league_validate_evidence(p_duel_id, v_me, p_evidence_path);

  if v_duel.home_player_id = v_me then
    v_side := 'HOME';
    v_team_id := v_duel.home_team_id;
    v_opponent_player := v_duel.away_player_id;
  elsif v_duel.away_player_id = v_me then
    v_side := 'AWAY';
    v_team_id := v_duel.away_team_id;
    v_opponent_player := v_duel.home_player_id;
  else
    raise exception 'Only the assigned duel players can report a result.';
  end if;
  if not public.league_is_team_member(v_team_id, v_me) then
    raise exception 'You are no longer an active member of this squad.';
  end if;

  select * into v_report
  from public.league_duel_reports r
  where r.duel_id = p_duel_id and r.player_id = v_me
  for update;

  if v_report.id is not null and v_report.status in ('CONFIRMED','REJECTED') then
    raise exception 'This result can no longer be changed.';
  end if;

  if v_report.id is null then
    insert into public.league_duel_reports
      (duel_id, player_id, team_id, side, score_for, score_against,
       decided_by, evidence_path, note, status, submitted_at)
    values
      (p_duel_id, v_me, v_team_id, v_side, p_score_for, p_score_against,
       upper(p_decided_by), p_evidence_path, nullif(btrim(p_note), ''), 'SUBMITTED', now())
    returning * into v_report;
  else
    update public.league_duel_reports
      set side = v_side,
          team_id = v_team_id,
          score_for = p_score_for,
          score_against = p_score_against,
          decided_by = upper(p_decided_by),
          evidence_path = p_evidence_path,
          note = nullif(btrim(p_note), ''),
          status = 'SUBMITTED',
          submitted_at = now()
    where id = v_report.id
    returning * into v_report;
  end if;

  select * into v_opponent_report
  from public.league_duel_reports r
  where r.duel_id = p_duel_id and r.player_id = v_opponent_player
  for update;

  if v_opponent_report.id is not null and v_opponent_report.status = 'SUBMITTED' then
    if v_opponent_report.score_for = v_report.score_against
       and v_opponent_report.score_against = v_report.score_for
       and v_opponent_report.decided_by = v_report.decided_by then
      update public.league_duel_reports
        set status = 'CONFIRMED'
      where duel_id = p_duel_id and player_id in (v_me, v_opponent_player);
      update public.league_duels
        set home_score = case when v_side = 'HOME' then p_score_for else p_score_against end,
            away_score = case when v_side = 'HOME' then p_score_against else p_score_for end,
            winner_team_id = case
              when v_side = 'HOME' and p_score_for > p_score_against then v_duel.home_team_id
              when v_side = 'AWAY' and p_score_for > p_score_against then v_duel.away_team_id
              when v_side = 'HOME' then v_duel.away_team_id
              else v_duel.home_team_id end,
            status = 'CONFIRMED',
            confirmed_at = now()
      where id = p_duel_id;

      update public.league_fixtures
        set home_duel_wins = home_duel_wins + case
              when (v_side = 'HOME' and p_score_for > p_score_against)
                or (v_side = 'AWAY' and p_score_against > p_score_for) then 1 else 0 end,
            away_duel_wins = away_duel_wins + case
              when (v_side = 'AWAY' and p_score_for > p_score_against)
                or (v_side = 'HOME' and p_score_against > p_score_for) then 1 else 0 end
      where id = v_fixture.id;

      perform public.league_finalize_fixture(v_fixture.id);

      perform public.league_notify(
        v_opponent_player, 'LEAGUE_DUEL_CONFIRMED',
        'League duel confirmed',
        'Your 4vs4 duel result was confirmed.',
        'league_duel', p_duel_id);
      perform public.league_audit(
        v_season_id, 'DUEL_CONFIRMED', 'league_duel', p_duel_id,
        null, jsonb_build_object('score_for', p_score_for, 'score_against', p_score_against),
        null);
      return;
    end if;

    update public.league_duel_reports
      set status = 'DISPUTED'
    where duel_id = p_duel_id and player_id in (v_me, v_opponent_player);
    update public.league_duels set status = 'DISPUTED' where id = p_duel_id;

    if not exists (
      select 1 from public.league_disputes x
      where x.duel_id = p_duel_id and x.status in ('OPEN','UNDER_REVIEW')
    ) then
      insert into public.league_disputes
        (duel_id, opened_by, reason, evidence_path, status)
      values
        (p_duel_id, v_me, 'League duel result mismatch.',
         p_evidence_path, 'OPEN');
    end if;

    perform public.league_notify(
      v_opponent_player, 'LEAGUE_DUEL_DISPUTED',
      'League duel disputed',
      'Your 4vs4 duel result did not match. Staff will review it.',
      'league_duel', p_duel_id);
    perform public.league_notify_staff(
      'LEAGUE_DUEL_DISPUTED',
      'League duel needs review',
      'A 4vs4 duel result mismatch is waiting for staff review.',
      'league_duel', p_duel_id);
    perform public.league_audit(
      v_season_id, 'DUEL_DISPUTED', 'league_duel', p_duel_id,
      null, jsonb_build_object('score_for', p_score_for, 'score_against', p_score_against),
      'Result mismatch');
    return;
  end if;

  update public.league_duels set status = 'AWAITING_RESULTS' where id = p_duel_id;

  perform public.league_notify(
    v_opponent_player, 'LEAGUE_DUEL_RESULT',
    'League duel result waiting',
    'Your opponent submitted a 4vs4 result. Submit yours or confirm theirs.',
    'league_duel', p_duel_id);
  perform public.league_audit(
    v_season_id, 'DUEL_RESULT_SUBMITTED', 'league_duel', p_duel_id,
    null, jsonb_build_object('score_for', p_score_for, 'score_against', p_score_against),
    null);
end;
$$;

create or replace function public.league_confirm_duel_result(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_fixture_id uuid;
  v_team_id uuid;
  v_winner uuid;
  v_home_score int;
  v_away_score int;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
  v_opponent_report public.league_duel_reports%rowtype;
begin
  select f.season_id, d.fixture_id into v_season_id, v_fixture_id
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where d.id = p_duel_id;
  if v_season_id is null then
    raise exception 'League duel not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(p_duel_id);

  if v_season.status <> 'ACTIVE' then
    raise exception 'Results can only be confirmed in an active season.';
  end if;
  if v_fixture.status not in ('LINEUPS_REVEALED','IN_PROGRESS') then
    raise exception 'This fixture is no longer accepting confirmations.';
  end if;
  if v_duel.status <> 'AWAITING_RESULTS' then
    raise exception 'This duel has no result waiting for confirmation.';
  end if;
  if v_duel.home_player_id = v_me then
    v_team_id := v_duel.home_team_id;
  elsif v_duel.away_player_id = v_me then
    v_team_id := v_duel.away_team_id;
  else
    raise exception 'Only the assigned duel players can confirm a result.';
  end if;
  if not public.league_is_team_member(v_team_id, v_me) then
    raise exception 'You are no longer an active member of this squad.';
  end if;
  if exists (
    select 1 from public.league_duel_reports r
    where r.duel_id = p_duel_id and r.player_id = v_me
      and r.status in ('SUBMITTED','DISPUTED')
  ) then
    raise exception 'Your own reported result must be resolved by staff.';
  end if;
  if exists (
    select 1 from public.league_disputes x
    where x.duel_id = p_duel_id and x.status in ('OPEN','UNDER_REVIEW')
  ) then
    raise exception 'This duel is under dispute review.';
  end if;

  select * into v_opponent_report
  from public.league_duel_reports r
  where r.duel_id = p_duel_id and r.player_id <> v_me
    and r.status = 'SUBMITTED'
  for update;
  if v_opponent_report.id is null then
    raise exception 'There is no result waiting for confirmation.';
  end if;

  if v_opponent_report.side = 'HOME' then
    v_home_score := v_opponent_report.score_for;
    v_away_score := v_opponent_report.score_against;
    v_winner := case when v_home_score > v_away_score
      then v_duel.home_team_id else v_duel.away_team_id end;
  else
    v_home_score := v_opponent_report.score_against;
    v_away_score := v_opponent_report.score_for;
    v_winner := case when v_away_score > v_home_score
      then v_duel.away_team_id else v_duel.home_team_id end;
  end if;

  update public.league_duel_reports
    set status = 'CONFIRMED'
  where id = v_opponent_report.id;
  update public.league_duels
    set status = 'CONFIRMED',
        home_score = v_home_score,
        away_score = v_away_score,
        winner_team_id = v_winner,
        confirmed_at = now()
  where id = p_duel_id;

  update public.league_fixtures
    set home_duel_wins = home_duel_wins + case when v_winner = v_duel.home_team_id then 1 else 0 end,
        away_duel_wins = away_duel_wins + case when v_winner = v_duel.away_team_id then 1 else 0 end
  where id = v_fixture.id;

  perform public.league_finalize_fixture(v_fixture.id);

  perform public.league_notify(
    v_opponent_report.player_id, 'LEAGUE_DUEL_CONFIRMED',
    'League duel confirmed',
    'Your 4vs4 duel result was confirmed.',
    'league_duel', p_duel_id);
  perform public.league_audit(
    v_season_id, 'DUEL_CONFIRMED_BY_OPPONENT', 'league_duel', p_duel_id,
    null, jsonb_build_object('home_score', v_home_score, 'away_score', v_away_score),
    null);
end;
$$;

create or replace function public.league_dispute_duel(
  p_duel_id uuid,
  p_reason text,
  p_evidence_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_fixture_id uuid;
  v_opponent uuid;
  v_captain_team uuid;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
  v_id uuid;
begin
  select f.season_id, d.fixture_id into v_season_id, v_fixture_id
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where d.id = p_duel_id;
  if v_season_id is null then
    raise exception 'League duel not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(p_duel_id);

  if v_season.status <> 'ACTIVE' then
    raise exception 'Disputes can only be opened in an active season.';
  end if;
  if v_fixture.status not in ('LINEUPS_REVEALED','IN_PROGRESS') then
    raise exception 'This fixture is no longer accepting disputes.';
  end if;
  if v_duel.status not in ('STARTED','AWAITING_RESULTS') then
    raise exception 'This duel cannot be disputed (status %).', v_duel.status;
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;
  if p_evidence_path is not null then
    perform public.league_validate_evidence(p_duel_id, v_me, p_evidence_path);
  end if;

  if v_duel.home_player_id = v_me then
    v_opponent := v_duel.away_player_id;
  elsif v_duel.away_player_id = v_me then
    v_opponent := v_duel.home_player_id;
  else
    select t.id into v_captain_team
    from public.league_teams t
    where t.id in (v_duel.home_team_id, v_duel.away_team_id)
      and t.captain_id = v_me and t.status = 'APPROVED';

    if v_captain_team is null then
      raise exception 'Only a duel participant or their captain can open a dispute.';
    end if;
    v_opponent := case when v_captain_team = v_duel.home_team_id
      then v_duel.away_player_id else v_duel.home_player_id end;
  end if;

  if exists (
    select 1 from public.league_disputes x
    where x.duel_id = p_duel_id and x.status in ('OPEN','UNDER_REVIEW')
  ) then
    raise exception 'This duel already has an open dispute.';
  end if;

  insert into public.league_disputes
    (duel_id, opened_by, reason, evidence_path, status)
  values
    (p_duel_id, v_me, btrim(p_reason), p_evidence_path, 'OPEN')
  returning id into v_id;

  update public.league_duels set status = 'DISPUTED' where id = p_duel_id;
  update public.league_duel_reports
    set status = 'DISPUTED'
  where duel_id = p_duel_id and status = 'SUBMITTED';

  perform public.league_notify(
    v_opponent, 'LEAGUE_DUEL_DISPUTED',
    'League duel disputed',
    'Your 4vs4 duel was disputed. Staff will review it.',
    'league_duel', p_duel_id);
  perform public.league_notify_staff(
    'LEAGUE_DUEL_DISPUTED',
    'League duel needs review',
    'A 4vs4 duel dispute is waiting for staff review.',
    'league_duel', p_duel_id);
  perform public.league_audit(
    v_season_id, 'DUEL_DISPUTE_OPENED', 'league_duel', p_duel_id,
    null, jsonb_build_object('dispute_id', v_id), btrim(p_reason));

  return v_id;
end;
$$;

create or replace function public.league_resolve_dispute(
  p_dispute_id uuid,
  p_winner_team_id uuid,
  p_home_score int,
  p_away_score int,
  p_resolution text,
  p_forfeit boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_dispute_staff();
  v_dispute public.league_disputes%rowtype;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
  v_season_id uuid;
  v_fixture_id uuid;
  v_duel_id uuid;
  v_expected uuid;
begin
  select x.duel_id, f.season_id, d.fixture_id
    into v_duel_id, v_season_id, v_fixture_id
  from public.league_disputes x
  join public.league_duels d on d.id = x.duel_id
  join public.league_fixtures f on f.id = d.fixture_id
  where x.id = p_dispute_id;
  if v_duel_id is null then
    raise exception 'League dispute not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(v_duel_id);
  select * into v_dispute
  from public.league_disputes x
  where x.id = p_dispute_id
  for update;

  if v_season.status <> 'ACTIVE' then
    raise exception 'Disputes can only be resolved in an active season.';
  end if;
  if v_dispute.status not in ('OPEN','UNDER_REVIEW') then
    raise exception 'This dispute is already closed.';
  end if;
  if v_duel.status not in ('DISPUTED','AWAITING_RESULTS') then
    raise exception 'This duel is not waiting for dispute resolution.';
  end if;
  if p_resolution is null or char_length(btrim(p_resolution)) not between 3 and 1000 then
    raise exception 'Give a resolution between 3 and 1000 characters.';
  end if;
  if p_winner_team_id is null
     or p_winner_team_id not in (v_duel.home_team_id, v_duel.away_team_id) then
    raise exception 'The winning team must be part of this duel.';
  end if;

  if not coalesce(p_forfeit, false) then
    if p_home_score is null or p_home_score not between 0 and 99
       or p_away_score is null or p_away_score not between 0 and 99 then
      raise exception 'Scores must be between 0 and 99.';
    end if;
    if p_home_score = p_away_score then
      raise exception 'Duel scores must be decisive.';
    end if;
    v_expected := case when p_home_score > p_away_score
      then v_duel.home_team_id else v_duel.away_team_id end;
    if p_winner_team_id <> v_expected then
      raise exception 'The winner does not match the reported score.';
    end if;
  end if;

  if coalesce(p_forfeit, false) then
    update public.league_duel_reports
      set status = 'REJECTED'
    where duel_id = v_duel_id and status in ('SUBMITTED','DISPUTED');

    update public.league_duels
      set status = 'FORFEITED',
          home_score = null,
          away_score = null,
          winner_team_id = p_winner_team_id,
          confirmed_at = now(),
          resolved_by = v_me,
          resolution_note = btrim(p_resolution)
    where id = v_duel_id;
  else
    update public.league_duel_reports
      set status = case
        when (side = 'HOME' and score_for = p_home_score and score_against = p_away_score)
          or (side = 'AWAY' and score_for = p_away_score and score_against = p_home_score)
        then 'CONFIRMED' else 'REJECTED' end
    where duel_id = v_duel_id and status in ('SUBMITTED','DISPUTED');

    update public.league_duels
      set status = 'CONFIRMED',
          home_score = p_home_score,
          away_score = p_away_score,
          winner_team_id = p_winner_team_id,
          confirmed_at = now(),
          resolved_by = v_me,
          resolution_note = btrim(p_resolution)
    where id = v_duel_id;
  end if;

  update public.league_fixtures
    set home_duel_wins = home_duel_wins + case when p_winner_team_id = v_duel.home_team_id then 1 else 0 end,
        away_duel_wins = away_duel_wins + case when p_winner_team_id = v_duel.away_team_id then 1 else 0 end
  where id = v_duel.fixture_id;

  perform public.league_finalize_fixture(v_duel.fixture_id);

  update public.league_disputes
    set status = 'RESOLVED',
        resolution = btrim(p_resolution),
        resolved_by = v_me,
        resolved_at = now()
  where duel_id = v_duel_id and status in ('OPEN','UNDER_REVIEW');

  perform public.league_notify_team(
    v_duel.home_team_id, 'LEAGUE_DUEL_RESOLVED',
    'League dispute resolved',
    'Staff resolved a 4vs4 duel dispute.',
    'league_duel', v_duel_id);
  perform public.league_notify_team(
    v_duel.away_team_id, 'LEAGUE_DUEL_RESOLVED',
    'League dispute resolved',
    'Staff resolved a 4vs4 duel dispute.',
    'league_duel', v_duel_id);

  perform public.league_audit(
    v_season_id, 'DISPUTE_RESOLVED', 'league_duel', v_duel_id,
    jsonb_build_object('status', v_duel.status),
    jsonb_build_object(
      'status', case when coalesce(p_forfeit, false) then 'FORFEITED' else 'CONFIRMED' end,
      'winner_team_id', p_winner_team_id,
      'home_score', p_home_score, 'away_score', p_away_score),
    btrim(p_resolution));
end;
$$;

-- ============================================================================
-- 8. Read models: standings, player stats and team stats
-- ============================================================================

create or replace function public.league_standings(p_season_id uuid)
returns table (
  standing_position int,
  team_id uuid,
  team_name text,
  played int,
  wins int,
  draws int,
  losses int,
  duels_won int,
  duels_lost int,
  duel_diff int,
  fixture_points int,
  penalty_points int,
  points int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.league_require_active();

  return query
  with team_fixtures as (
    select
      t.id as tf_team_id,
      count(f.id) filter (where f.status in ('COMPLETED','FORFEITED'))::int as tf_played,
      count(f.id) filter (
        where f.status in ('COMPLETED','FORFEITED')
          and ((f.home_team_id = t.id and f.home_points = 3)
            or (f.away_team_id = t.id and f.away_points = 3))
      )::int as tf_wins,
      count(f.id) filter (
        where f.status in ('COMPLETED','FORFEITED')
          and ((f.home_team_id = t.id and f.home_points = 1)
            or (f.away_team_id = t.id and f.away_points = 1))
      )::int as tf_draws,
      count(f.id) filter (
        where f.status in ('COMPLETED','FORFEITED')
          and ((f.home_team_id = t.id and f.home_points = 0)
            or (f.away_team_id = t.id and f.away_points = 0))
      )::int as tf_losses,
      coalesce(sum(
        case when f.home_team_id = t.id then f.home_duel_wins else f.away_duel_wins end
      ) filter (where f.status in ('COMPLETED','FORFEITED')), 0)::int as tf_duels_won,
      coalesce(sum(
        case when f.home_team_id = t.id then f.home_points else f.away_points end
      ) filter (where f.status in ('COMPLETED','FORFEITED')), 0)::int as tf_points
    from public.league_teams t
    left join public.league_fixtures f
      on f.season_id = t.season_id
     and (f.home_team_id = t.id or f.away_team_id = t.id)
    where t.season_id = p_season_id and t.status = 'APPROVED'
    group by t.id
  ),
  penalty_totals as (
    select p.team_id, sum(p.points)::int as penalty_points
    from public.league_penalties p
    where p.season_id = p_season_id
    group by p.team_id
  ),
  base as (
    select
      tf.tf_team_id as b_team_id,
      t.name as b_name,
      tf.tf_played as b_played,
      tf.tf_wins as b_wins,
      tf.tf_draws as b_draws,
      tf.tf_losses as b_losses,
      tf.tf_duels_won as b_duels_won,
      (4 * tf.tf_played - tf.tf_duels_won)::int as b_duels_lost,
      (2 * tf.tf_duels_won - 4 * tf.tf_played)::int as b_duel_diff,
      tf.tf_points as b_fixture_points,
      coalesce(pt.penalty_points, 0)::int as b_penalty_points,
      (tf.tf_points + coalesce(pt.penalty_points, 0))::int as b_points
    from team_fixtures tf
    join public.league_teams t on t.id = tf.tf_team_id
    left join penalty_totals pt on pt.team_id = tf.tf_team_id
  ),
  with_h2h as (
    select
      b.*,
      coalesce((
        select sum(
          case when f.home_team_id = b.b_team_id then f.home_points else f.away_points end
        )::int
        from public.league_fixtures f
        join base b2
          on b2.b_team_id = case when f.home_team_id = b.b_team_id
            then f.away_team_id else f.home_team_id end
        where f.season_id = p_season_id
          and f.status in ('COMPLETED','FORFEITED')
          and (f.home_team_id = b.b_team_id or f.away_team_id = b.b_team_id)
          and b2.b_points = b.b_points
          and b2.b_duel_diff = b.b_duel_diff
          and b2.b_duels_won = b.b_duels_won
      ), 0)::int as b_h2h_points
    from base b
  )
  select
    row_number() over (
      order by
        h.b_points desc,
        h.b_duel_diff desc,
        h.b_duels_won desc,
        h.b_h2h_points desc,
        coalesce(tb.position, 2147483647),
        h.b_name asc,
        h.b_team_id
    )::int as standing_position,
    h.b_team_id,
    h.b_name,
    h.b_played,
    h.b_wins,
    h.b_draws,
    h.b_losses,
    h.b_duels_won,
    h.b_duels_lost,
    h.b_duel_diff,
    h.b_fixture_points,
    h.b_penalty_points,
    h.b_points
  from with_h2h h
  left join public.league_tiebreak_orders tb
    on tb.season_id = p_season_id and tb.team_id = h.b_team_id;
end;
$$;

create or replace function public.league_player_stats(p_season_id uuid)
returns table (
  player_id uuid,
  player_name text,
  team_id uuid,
  team_name text,
  duels_played int,
  duels_won int,
  duels_lost int,
  goals_for int,
  goals_against int,
  goal_diff int,
  win_rate numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.league_require_active();

  return query
  with final_duels as (
    select d.*
    from public.league_duels d
    join public.league_fixtures f on f.id = d.fixture_id
    where f.season_id = p_season_id
      and d.status in ('CONFIRMED','FORFEITED')
  ),
  stat_rows as (
    select
      d.home_player_id as sr_player_id,
      d.home_team_id as sr_team_id,
      case when d.winner_team_id = d.home_team_id then 1 else 0 end as sr_won,
      coalesce(d.home_score, 0) as sr_goals_for,
      coalesce(d.away_score, 0) as sr_goals_against
    from final_duels d
    union all
    select
      d.away_player_id,
      d.away_team_id,
      case when d.winner_team_id = d.away_team_id then 1 else 0 end,
      coalesce(d.away_score, 0),
      coalesce(d.home_score, 0)
    from final_duels d
  )
  select
    s.sr_player_id,
    coalesce(nullif(p.display_name, ''), p.username, '?'),
    s.sr_team_id,
    t.name,
    count(*)::int,
    sum(s.sr_won)::int,
    (count(*) - sum(s.sr_won))::int,
    sum(s.sr_goals_for)::int,
    sum(s.sr_goals_against)::int,
    (sum(s.sr_goals_for) - sum(s.sr_goals_against))::int,
    round(100.0 * sum(s.sr_won) / nullif(count(*), 0), 1)
  from stat_rows s
  join public.profiles p on p.id = s.sr_player_id
  join public.league_teams t on t.id = s.sr_team_id
  group by s.sr_player_id, p.display_name, p.username, s.sr_team_id, t.name
  order by 11 desc nulls last, 10 desc, 2 asc;
end;
$$;

create or replace function public.league_team_stats(p_season_id uuid)
returns table (
  team_id uuid,
  team_name text,
  played int,
  wins int,
  draws int,
  losses int,
  duels_won int,
  duels_lost int,
  duel_diff int,
  goals_for int,
  goals_against int,
  points int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.league_require_active();

  return query
  with final_duels as (
    select d.*
    from public.league_duels d
    join public.league_fixtures f on f.id = d.fixture_id
    where f.season_id = p_season_id
      and d.status in ('CONFIRMED','FORFEITED')
  ),
  goals as (
    select g.ts_team_id, sum(g.ts_for)::int as goals_for, sum(g.ts_against)::int as goals_against
    from (
      select d.home_team_id as ts_team_id, coalesce(d.home_score, 0) as ts_for,
             coalesce(d.away_score, 0) as ts_against
      from final_duels d
      union all
      select d.away_team_id, coalesce(d.away_score, 0), coalesce(d.home_score, 0)
      from final_duels d
    ) g
    group by g.ts_team_id
  )
  select
    t.id,
    t.name,
    count(f.id) filter (where f.status in ('COMPLETED','FORFEITED'))::int as played,
    count(f.id) filter (
      where f.status in ('COMPLETED','FORFEITED')
        and ((f.home_team_id = t.id and f.home_points = 3)
          or (f.away_team_id = t.id and f.away_points = 3))
    )::int as wins,
    count(f.id) filter (
      where f.status in ('COMPLETED','FORFEITED')
        and ((f.home_team_id = t.id and f.home_points = 1)
          or (f.away_team_id = t.id and f.away_points = 1))
    )::int as draws,
    count(f.id) filter (
      where f.status in ('COMPLETED','FORFEITED')
        and ((f.home_team_id = t.id and f.home_points = 0)
          or (f.away_team_id = t.id and f.away_points = 0))
    )::int as losses,
    coalesce(sum(
      case when f.home_team_id = t.id then f.home_duel_wins else f.away_duel_wins end
    ) filter (where f.status in ('COMPLETED','FORFEITED')), 0)::int as duels_won,
    (4 * count(f.id) filter (where f.status in ('COMPLETED','FORFEITED'))
      - coalesce(sum(
          case when f.home_team_id = t.id then f.home_duel_wins else f.away_duel_wins end
        ) filter (where f.status in ('COMPLETED','FORFEITED')), 0))::int as duels_lost,
    (2 * coalesce(sum(
        case when f.home_team_id = t.id then f.home_duel_wins else f.away_duel_wins end
      ) filter (where f.status in ('COMPLETED','FORFEITED')), 0)
      - 4 * count(f.id) filter (where f.status in ('COMPLETED','FORFEITED')))::int as duel_diff,
    coalesce(g.goals_for, 0),
    coalesce(g.goals_against, 0),
    (coalesce(sum(
      case when f.home_team_id = t.id then f.home_points else f.away_points end
    ) filter (where f.status in ('COMPLETED','FORFEITED')), 0)
      + coalesce((
        select sum(p.points)::int from public.league_penalties p
        where p.season_id = p_season_id and p.team_id = t.id
      ), 0))::int
  from public.league_teams t
  left join public.league_fixtures f
    on f.season_id = t.season_id
   and (f.home_team_id = t.id or f.away_team_id = t.id)
  left join goals g on g.ts_team_id = t.id
  where t.season_id = p_season_id and t.status = 'APPROVED'
  group by t.id, t.name, g.goals_for, g.goals_against
  order by points desc, duel_diff desc, duels_won desc, t.name asc;
end;
$$;

-- ============================================================================
-- 9. Privileges
-- ============================================================================

revoke all on function public.league_require_active() from public, anon, authenticated;
revoke all on function public.league_require_admin() from public, anon, authenticated;
revoke all on function public.league_require_dispute_staff() from public, anon, authenticated;
revoke all on function public.league_require_captain(uuid) from public, anon, authenticated;
revoke all on function public.league_audit(uuid, text, text, uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.league_notify(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.league_notify_team(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.league_notify_staff(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.league_notify_season(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.league_lock_season(uuid) from public, anon, authenticated;
revoke all on function public.league_lock_team(uuid) from public, anon, authenticated;
revoke all on function public.league_lock_matchday(uuid) from public, anon, authenticated;
revoke all on function public.league_lock_fixture(uuid) from public, anon, authenticated;
revoke all on function public.league_lock_duel(uuid) from public, anon, authenticated;
revoke all on function public.league_validate_evidence(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.league_maybe_reveal_fixture(uuid) from public, anon, authenticated;
revoke all on function public.league_finalize_fixture(uuid) from public, anon, authenticated;

revoke all on function public.league_create_season(text, text, timestamptz, timestamptz, timestamptz, int, int, int, int, int) from public, anon, authenticated;
revoke all on function public.league_update_season(uuid, text, text, timestamptz, timestamptz, timestamptz, int, int, int, int, int) from public, anon, authenticated;
revoke all on function public.league_set_season_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.league_generate_fixtures(uuid, boolean) from public, anon, authenticated;
revoke all on function public.league_extend_matchday(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.league_approve_team(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.league_replace_member(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.league_apply_penalty(uuid, uuid, int, text, uuid) from public, anon, authenticated;
revoke all on function public.league_set_tiebreak_order(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.league_create_team(uuid, text) from public, anon, authenticated;
revoke all on function public.league_update_team(uuid, text) from public, anon, authenticated;
revoke all on function public.league_invite_member(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.league_answer_invite(uuid, boolean) from public, anon, authenticated;
revoke all on function public.league_leave_team(uuid) from public, anon, authenticated;
revoke all on function public.league_remove_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.league_transfer_captain(uuid, uuid) from public, anon, authenticated;
revoke all on function public.league_submit_lineup(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.league_start_duel(uuid) from public, anon, authenticated;
revoke all on function public.league_substitute_player(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.league_submit_duel_result(uuid, int, int, text, text, text) from public, anon, authenticated;
revoke all on function public.league_confirm_duel_result(uuid) from public, anon, authenticated;
revoke all on function public.league_dispute_duel(uuid, text, text) from public, anon, authenticated;
revoke all on function public.league_resolve_dispute(uuid, uuid, int, int, text, boolean) from public, anon, authenticated;
revoke all on function public.league_standings(uuid) from public, anon, authenticated;
revoke all on function public.league_player_stats(uuid) from public, anon, authenticated;
revoke all on function public.league_team_stats(uuid) from public, anon, authenticated;

grant execute on function public.league_create_season(text, text, timestamptz, timestamptz, timestamptz, int, int, int, int, int) to authenticated;
grant execute on function public.league_update_season(uuid, text, text, timestamptz, timestamptz, timestamptz, int, int, int, int, int) to authenticated;
grant execute on function public.league_set_season_status(uuid, text, text) to authenticated;
grant execute on function public.league_generate_fixtures(uuid, boolean) to authenticated;
grant execute on function public.league_extend_matchday(uuid, timestamptz, text) to authenticated;
grant execute on function public.league_approve_team(uuid, boolean, text) to authenticated;
grant execute on function public.league_replace_member(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.league_apply_penalty(uuid, uuid, int, text, uuid) to authenticated;
grant execute on function public.league_set_tiebreak_order(uuid, uuid[], text) to authenticated;
grant execute on function public.league_create_team(uuid, text) to authenticated;
grant execute on function public.league_update_team(uuid, text) to authenticated;
grant execute on function public.league_invite_member(uuid, uuid, text) to authenticated;
grant execute on function public.league_answer_invite(uuid, boolean) to authenticated;
grant execute on function public.league_leave_team(uuid) to authenticated;
grant execute on function public.league_remove_member(uuid, uuid) to authenticated;
grant execute on function public.league_transfer_captain(uuid, uuid) to authenticated;
grant execute on function public.league_submit_lineup(uuid, jsonb) to authenticated;
grant execute on function public.league_start_duel(uuid) to authenticated;
grant execute on function public.league_substitute_player(uuid, uuid, uuid) to authenticated;
grant execute on function public.league_submit_duel_result(uuid, int, int, text, text, text) to authenticated;
grant execute on function public.league_confirm_duel_result(uuid) to authenticated;
grant execute on function public.league_dispute_duel(uuid, text, text) to authenticated;
grant execute on function public.league_resolve_dispute(uuid, uuid, int, int, text, boolean) to authenticated;
grant execute on function public.league_standings(uuid) to authenticated;
grant execute on function public.league_player_stats(uuid) to authenticated;
grant execute on function public.league_team_stats(uuid) to authenticated;
