-- VIK Clan migration 0050: 4vs4 season winner badge.
--
-- Two steps:
--   1. league_set_winner_badge: the admin uploads/changes the badge that the
--      first-place squad will earn. It can be uploaded while the season is
--      still in DRAFT/REGISTRATION/ACTIVE.
--   2. league_award_winner_badge: once the season is COMPLETED/ARCHIVED, the
--      RPC resolves the standings winner and awards one LEAGUE4V4_CHAMPION
--      achievement (with the badge image) to every ACTIVE member of that
--      squad, so it shows in their profile badge area.

alter table public.league_seasons add column if not exists winner_badge_path text;
alter table public.league_seasons add column if not exists winner_team_id uuid
  references public.league_teams(id) on delete set null;
alter table public.league_seasons add column if not exists winner_badge_awarded_at timestamptz;

create or replace function public.league_set_winner_badge(
  p_season_id uuid,
  p_badge_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
  v_path text := nullif(btrim(coalesce(p_badge_path, '')), '');
begin
  perform public.league_require_admin();
  v_season := public.league_lock_season(p_season_id);

  if v_path is null then
    raise exception 'Upload a badge image first.';
  end if;
  if v_season.winner_badge_awarded_at is not null then
    raise exception 'The winner badge was already awarded for this season.';
  end if;

  update public.league_seasons
    set winner_badge_path = v_path
    where id = p_season_id;

  perform public.league_audit(
    p_season_id,
    'WINNER_BADGE_UPLOADED',
    'league_season',
    p_season_id,
    jsonb_build_object('winner_badge_path', v_season.winner_badge_path),
    jsonb_build_object('winner_badge_path', v_path),
    null);
end;
$$;

create or replace function public.league_award_winner_badge(
  p_season_id uuid
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
  v_winner record;
  v_awarded int := 0;
  r record;
begin
  perform public.league_require_admin();
  v_season := public.league_lock_season(p_season_id);

  if v_season.status not in ('COMPLETED','ARCHIVED') then
    raise exception 'Complete the season before awarding the winner badge.';
  end if;
  if v_season.winner_badge_path is null then
    raise exception 'Upload the winner badge first.';
  end if;
  if v_season.winner_badge_awarded_at is not null then
    raise exception 'The winner badge was already awarded for this season.';
  end if;

  select s.team_id, s.team_name
  into v_winner
  from public.league_standings(p_season_id) s
  order by s.standing_position
  limit 1;

  if v_winner.team_id is null then
    raise exception 'No standings are available for this season.';
  end if;

  update public.league_seasons
    set winner_team_id = v_winner.team_id,
        winner_badge_awarded_at = now()
    where id = p_season_id;

  for r in
    select distinct m.player_id
    from public.league_team_members m
    join public.profiles p on p.id = m.player_id and p.status = 'ACTIVE'
    where m.team_id = v_winner.team_id and m.status = 'ACTIVE'
  loop
    insert into public.achievements
      (player_id, competition_id, type, name, description, image_url)
    values
      (r.player_id, null, 'LEAGUE4V4_CHAMPION',
       format('%s — 4vs4 Champions', v_season.name),
       format('Won first place in the 4vs4 League season "%s" with %s.',
         v_season.name, v_winner.team_name),
       v_season.winner_badge_path);

    perform public.league_notify(
      r.player_id,
      'LEAGUE_WINNER_BADGE',
      '4vs4 Champions',
      format('Your squad %s won the 4vs4 season "%s". A champion badge was added to your profile.',
        v_winner.team_name, v_season.name),
      'league_season', p_season_id);

    v_awarded := v_awarded + 1;
  end loop;

  perform public.league_audit(
    p_season_id,
    'WINNER_BADGE_AWARDED',
    'league_season',
    p_season_id,
    jsonb_build_object('winner_badge_path', v_season.winner_badge_path),
    jsonb_build_object('winner_team_id', v_winner.team_id,
      'winner_badge_path', v_season.winner_badge_path,
      'awarded_players', v_awarded),
    null);

  return v_awarded;
end;
$$;

revoke all on function public.league_set_winner_badge(uuid, text) from public, anon, authenticated;
revoke all on function public.league_award_winner_badge(uuid) from public, anon, authenticated;
grant execute on function public.league_set_winner_badge(uuid, text) to authenticated;
grant execute on function public.league_award_winner_badge(uuid) to authenticated;
