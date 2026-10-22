-- VIK Clan migration 0047: captains can undo a pending 4vs4 invite.

create or replace function public.league_revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.league_team_invites%rowtype;
begin
  perform public.league_require_active();

  select * into v_invite
  from public.league_team_invites
  where id = p_invite_id
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found.';
  end if;

  perform public.league_require_captain(v_invite.team_id);

  if v_invite.status <> 'PENDING' then
    raise exception 'This invite is no longer pending.';
  end if;

  update public.league_team_invites
    set status = 'REVOKED', responded_at = now()
    where id = p_invite_id;

  perform public.league_audit(
    v_invite.season_id, 'INVITE_REVOKED', 'league_team', v_invite.team_id,
    jsonb_build_object('status', v_invite.status),
    jsonb_build_object('status', 'REVOKED', 'player_id', v_invite.player_id,
      'invite_id', p_invite_id), null);
end;
$$;

revoke all on function public.league_revoke_invite(uuid) from public, anon, authenticated;
grant execute on function public.league_revoke_invite(uuid) to authenticated;
