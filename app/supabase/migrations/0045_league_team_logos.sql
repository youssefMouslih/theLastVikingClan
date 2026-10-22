-- VIK Clan migration 0045: 4vs4 squad logos.
-- Run AFTER 0044. Private league-assets bucket, captain-only writes,
-- logo_path validation, and one RPC to set or clear a squad logo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('league-assets', 'league-assets', false, 2097152,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "league logos read" on storage.objects;
create policy "league logos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'league-assets');

drop policy if exists "league captains upload logos" on storage.objects;
create policy "league captains upload logos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'league-assets'
    and (storage.foldername(name))[1] = 'league'
    and exists (
      select 1 from public.league_teams t
      where t.id::text = (storage.foldername(name))[2]
        and t.captain_id = auth.uid()
        and t.status in ('PENDING','APPROVED')
    )
  );

drop policy if exists "league captains update logos" on storage.objects;
create policy "league captains update logos" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'league-assets'
    and (storage.foldername(name))[1] = 'league'
    and exists (
      select 1 from public.league_teams t
      where t.id::text = (storage.foldername(name))[2]
        and t.captain_id = auth.uid()
        and t.status in ('PENDING','APPROVED')
    )
  )
  with check (
    bucket_id = 'league-assets'
    and (storage.foldername(name))[1] = 'league'
    and exists (
      select 1 from public.league_teams t
      where t.id::text = (storage.foldername(name))[2]
        and t.captain_id = auth.uid()
        and t.status in ('PENDING','APPROVED')
    )
  );

drop policy if exists "league captains delete logos" on storage.objects;
create policy "league captains delete logos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'league-assets'
    and (storage.foldername(name))[1] = 'league'
    and exists (
      select 1 from public.league_teams t
      where t.id::text = (storage.foldername(name))[2]
        and t.captain_id = auth.uid()
        and t.status in ('PENDING','APPROVED')
    )
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
    if v_path not like ('league/' || p_team_id::text || '/%') then
      raise exception 'Squad logo must live under league/%.', p_team_id;
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
