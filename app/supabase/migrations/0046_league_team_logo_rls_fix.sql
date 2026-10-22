-- VIK Clan migration 0046: fix league squad logo uploads.
-- 0045 tied the storage policy to a subquery on public.league_teams.
-- Use the uploader's own folder instead: league/<auth.uid()>/<team_id>/...
-- The captain check stays in league_set_team_logo, so another player can
-- never attach their upload to a team they do not captain.

drop policy if exists "league captains upload logos" on storage.objects;
create policy "league captains upload logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'league-assets'
    and (storage.foldername(name))[1] = 'league'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "league captains update logos" on storage.objects;
create policy "league captains update logos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'league-assets'
    and (storage.foldername(name))[1] = 'league'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'league-assets'
    and (storage.foldername(name))[1] = 'league'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "league captains delete logos" on storage.objects;
create policy "league captains delete logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'league-assets'
    and (storage.foldername(name))[1] = 'league'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create or replace function public.league_set_team_logo(
  p_team_id uuid,
  p_logo_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_path text := nullif(btrim(coalesce(p_logo_path, '')), '');
begin
  perform public.league_require_captain(p_team_id);
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status not in ('REGISTRATION','ACTIVE') then
    raise exception 'Squad logos cannot be changed in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad can no longer be edited.';
  end if;

  if v_path is not null then
    if char_length(v_path) > 300 then
      raise exception 'Squad logo path is too long.';
    end if;
    if v_path not like ('league/' || auth.uid()::text || '/' || p_team_id::text || '/%') then
      raise exception 'Squad logo must live under league/<you>/%.', p_team_id;
    end if;
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'league-assets'
        and o.name = v_path
        and o.owner = auth.uid()
    ) then
      raise exception 'Squad logo file not found.';
    end if;
  end if;

  update public.league_teams
    set logo_path = v_path, updated_at = now()
    where id = p_team_id;

  perform public.league_audit(
    v_team.season_id, 'TEAM_LOGO_UPDATED', 'league_team', p_team_id,
    jsonb_build_object('logo_path', v_team.logo_path),
    jsonb_build_object('logo_path', v_path), null);
end;
$$;

revoke all on function public.league_set_team_logo(uuid, text) from public, anon, authenticated;
grant execute on function public.league_set_team_logo(uuid, text) to authenticated;
