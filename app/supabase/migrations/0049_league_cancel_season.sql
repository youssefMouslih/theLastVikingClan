-- VIK Clan migration 0049: admins can cancel (delete) a league season.
--
-- Cancelling removes the season and every child row (squads, members,
-- invites, matchdays, fixtures, lineups) through the existing cascade.
-- Seasons that already have duels are refused so recorded/ongoing results
-- are never silently destroyed.

create or replace function public.league_cancel_season(
  p_season_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
  v_duels int;
begin
  perform public.league_require_admin();
  v_season := public.league_lock_season(p_season_id);

  if v_season.status not in ('DRAFT','REGISTRATION','ACTIVE') then
    raise exception 'Only draft, registration or active seasons can be cancelled.';
  end if;

  select count(*) into v_duels
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where f.season_id = p_season_id;

  if v_duels > 0 then
    raise exception 'This season already has duels and cannot be cancelled.';
  end if;

  perform public.league_notify_season(
    p_season_id,
    'LEAGUE_SEASON_CANCELLED',
    'League season cancelled',
    format('The 4vs4 season "%s" was cancelled by the staff.', v_season.name),
    'league_season', p_season_id);

  perform public.league_audit(
    p_season_id,
    'SEASON_CANCELLED',
    'league_season',
    p_season_id,
    jsonb_build_object('name', v_season.name, 'status', v_season.status),
    null,
    p_reason);

  delete from public.league_seasons where id = p_season_id;
end;
$$;

revoke all on function public.league_cancel_season(uuid, text) from public, anon, authenticated;
grant execute on function public.league_cancel_season(uuid, text) to authenticated;
