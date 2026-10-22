-- VIK Clan migration 0048: short squad bio.

alter table public.league_teams add column if not exists bio text;

alter table public.league_teams drop constraint if exists league_teams_bio_check;
alter table public.league_teams add constraint league_teams_bio_check
  check (bio is null or char_length(bio) <= 160);

create or replace function public.league_set_team_bio(
  p_team_id uuid,
  p_bio text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_bio text := nullif(btrim(coalesce(p_bio, '')), '');
begin
  perform public.league_require_captain(p_team_id);
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status not in ('REGISTRATION','ACTIVE') then
    raise exception 'Squad bio cannot be changed in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad can no longer be edited.';
  end if;
  if char_length(v_bio) > 160 then
    raise exception 'Squad bio must be 160 characters or less.';
  end if;

  update public.league_teams
    set bio = v_bio, updated_at = now()
    where id = p_team_id;

  perform public.league_audit(
    v_team.season_id, 'TEAM_BIO_UPDATED', 'league_team', p_team_id,
    jsonb_build_object('bio', v_team.bio),
    jsonb_build_object('bio', v_bio), null);
end;
$$;

revoke all on function public.league_set_team_bio(uuid, text) from public, anon, authenticated;
grant execute on function public.league_set_team_bio(uuid, text) to authenticated;
