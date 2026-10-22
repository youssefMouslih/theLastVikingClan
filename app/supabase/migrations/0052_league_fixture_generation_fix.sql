-- VIK Clan migration 0052: deterministic 4vs4 fixture generation.
--
-- The deployed generator could raise
-- league_fixtures_season_id_leg_home_team_id_away_team_id_key on the first
-- generation. This replaces the array-rotation schedule with the standard
-- circle formula, which produces every pairing exactly once per leg.

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
  v_n int;
  v_idx_a int;
  v_idx_b int;
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

  v_n := v_slots - 1;

  for v_r in 0..(v_rounds - 1) loop
    for v_i in 0..((v_slots / 2) - 1) loop
      if v_i = 0 then
        v_idx_a := v_slots;
        v_idx_b := v_r + 1;
      else
        v_idx_a := ((v_r + v_i) % v_n) + 1;
        v_idx_b := ((v_r - v_i + (2 * v_n)) % v_n) + 1;
      end if;

      v_a := v_teams[v_idx_a];
      v_b := v_teams[v_idx_b];

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

revoke all on function public.league_generate_fixtures(uuid, boolean) from public, anon, authenticated;
grant execute on function public.league_generate_fixtures(uuid, boolean) to authenticated;
