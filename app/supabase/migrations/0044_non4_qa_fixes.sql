-- VIK Clan migration 0044: non-4vs4 QA fixes.
-- Run AFTER 0043. Fixes admin/owner escalation, open-mat acceptance,
-- throne pledge redirects, squad leader invites/answers, and public tryouts.

-- ============ profiles: ownership and admin changes stay with the OWNER ============
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  caller_owner boolean := false;
  owner_transfer boolean := coalesce(current_setting('vik.owner_transfer', true), '') = '1';
begin
  if me is not null then
    select exists(select 1 from public.profiles where id = me and role = 'OWNER')
      into caller_owner;
  end if;
  if owner_transfer then
    return NEW;
  end if;
  if (NEW.role is distinct from OLD.role or NEW.status is distinct from OLD.status)
    and me = OLD.id then
    raise exception 'You cannot change your own role or status.';
  end if;
  if NEW.role = 'OWNER' or OLD.role = 'OWNER' then
    raise exception 'Ownership changes must use transfer_ownership.';
  end if;
  if (NEW.role = 'ADMIN' or OLD.role = 'ADMIN') and not caller_owner then
    raise exception 'Only the OWNER can manage admin roles.';
  end if;
  if public.is_clan_role(array['OWNER','ADMIN']) then
    return NEW;
  end if;
  if (NEW.role is distinct from OLD.role
      or NEW.status is distinct from OLD.status
      or NEW.username is distinct from OLD.username
      or NEW.email is distinct from OLD.email) then
    raise exception 'Only staff can change role, status, username or email.';
  end if;
  return NEW;
end $$;

create or replace function public.transfer_ownership(p_new_owner uuid, p_confirmation text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tgt record;
  r record;
begin
  if me is null or not public.is_clan_role(array['OWNER']) then
    raise exception 'Only the owner can transfer ownership.';
  end if;
  if p_new_owner is null or p_new_owner = me then
    raise exception 'You are already the owner.';
  end if;
  for r in select id from public.profiles
      where id = me or id = p_new_owner order by id for update loop
    null;
  end loop;
  select * into tgt from public.profiles where id = p_new_owner;
  if tgt is null then raise exception 'Member not found.'; end if;
  if tgt.role != 'ADMIN' or tgt.status != 'ACTIVE' then
    raise exception 'The new owner must be an ACTIVE ADMIN.';
  end if;
  if p_confirmation is distinct from tgt.username then
    raise exception 'Confirmation does not match — type the new owner''s username exactly.';
  end if;
  perform set_config('vik.owner_transfer', '1', true);
  update public.profiles set role = 'OWNER', updated_at = now() where id = tgt.id;
  update public.profiles set role = 'ADMIN', updated_at = now() where id = me;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data, reason)
    values (me, 'ADMIN_TRANSFERRED_OWNERSHIP', 'player', tgt.id,
      jsonb_build_object('role', 'ADMIN'), jsonb_build_object('role', 'OWNER'),
      'Ownership transferred to ' || tgt.username);
  insert into public.notifications (user_id, type, title, message)
    values (tgt.id, 'COMPETITION_FINISHED', 'You hold the throne',
      'Ownership of the clan was transferred to you.');
end $$;
revoke all on function public.transfer_ownership(uuid, text) from public;
grant execute on function public.transfer_ownership(uuid, text) to authenticated;

-- ============ challenges: first taker may accept an open call ============
drop policy if exists "open calls first taker" on public.challenges;
create policy "open calls first taker" on public.challenges
  for update to authenticated
  using (is_open = true and status = 'PENDING' and opponent_id is null
    and expires_at is not null and expires_at > now())
  with check (status = 'ACCEPTED' and is_open = false and opponent_id = auth.uid());

-- ============ challenges: throne transfer may redirect pending pledges ============
create or replace function public.guard_challenge_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  is_part boolean := (OLD.challenger_id = me or OLD.opponent_id = me);
begin
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  if (NEW.challenger_id is distinct from OLD.challenger_id
      or NEW.type is distinct from OLD.type
      or NEW.forced is distinct from OLD.forced
      or NEW.for_throne is distinct from OLD.for_throne
      or NEW.opponent_label is distinct from OLD.opponent_label
      or NEW.conditions is distinct from OLD.conditions
      or NEW.stakes is distinct from OLD.stakes) then
    raise exception 'Only staff can change challenge terms.';
  end if;
  if OLD.is_open = true and OLD.status = 'PENDING' and OLD.opponent_id is null
    and NEW.status = 'ACCEPTED' and NEW.opponent_id = me and NEW.is_open = false
    and OLD.challenger_id is distinct from me then
    return NEW;
  end if;
  if OLD.is_open = true and OLD.status = 'PENDING'
    and OLD.expires_at is not null and OLD.expires_at < now()
    and NEW.status = 'CANCELLED' then
    return NEW;
  end if;
  if OLD.for_throne = true
    and OLD.status in ('PENDING','ACCEPTED')
    and OLD.opponent_id = me
    and NEW.status = 'PENDING'
    and NEW.opponent_id is distinct from OLD.opponent_id
    and NEW.responded_at is null
    and NEW.is_open is not distinct from OLD.is_open
    and NEW.expires_at is not distinct from OLD.expires_at
    and NEW.score_a is not distinct from OLD.score_a
    and NEW.score_b is not distinct from OLD.score_b
    and NEW.submitted_by is not distinct from OLD.submitted_by
    and NEW.evidence_path is not distinct from OLD.evidence_path
    and NEW.xp_capped is not distinct from OLD.xp_capped
    and exists (select 1 from public.throne_reigns tr
                where tr.ended_at is null and tr.holder_id = NEW.opponent_id) then
    return NEW;
  end if;
  if not is_part then
    raise exception 'Only participants can update this battle.';
  end if;
  if OLD.status = 'PENDING' and OLD.opponent_id = me
    and NEW.status in ('ACCEPTED','DECLINED')
    and (NEW.status = 'ACCEPTED' or OLD.forced = false) then
    return NEW;
  end if;
  if OLD.status = 'ACCEPTED' and NEW.status = 'RESULT_SUBMITTED'
    and OLD.submitted_by is null and NEW.submitted_by = me
    and NEW.score_a is not null and NEW.score_b is not null
    and NEW.score_a >= 0 and NEW.score_b >= 0 then
    return NEW;
  end if;
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'COMPLETED'
    and OLD.submitted_by is not null and OLD.submitted_by is distinct from me
    and NEW.score_a is not distinct from OLD.score_a
    and NEW.score_b is not distinct from OLD.score_b
    and NEW.submitted_by is not distinct from OLD.submitted_by then
    return NEW;
  end if;
  if OLD.status in ('PENDING','ACCEPTED') and NEW.status = 'CANCELLED'
    and (OLD.challenger_id = me or OLD.type = 'FRIENDLY') then
    return NEW;
  end if;
  if OLD.challenger_id = me and OLD.is_open = true and OLD.status = 'PENDING'
    and NEW.status = 'PENDING' and NEW.expires_at > OLD.expires_at then
    return NEW;
  end if;
  raise exception 'Battle update not allowed.';
end $$;

-- ============ squads: leaders may invite and answer requests ============
drop policy if exists "leaders invite squad members" on public.squad_members;
create policy "leaders invite squad members" on public.squad_members
  for insert to authenticated
  with check (
    status = 'PENDING' and role = 'MEMBER'
    and player_id is distinct from auth.uid()
    and exists (select 1 from public.squads s
      where s.id = squad_id and s.leader_id = auth.uid() and s.status <> 'DISBANDED')
  );

drop policy if exists "leaders answer squad invites" on public.squad_members;
create policy "leaders answer squad invites" on public.squad_members
  for update to authenticated
  using (exists (select 1 from public.squads s
    where s.id = squad_id and s.leader_id = auth.uid() and s.status <> 'DISBANDED'))
  with check (exists (select 1 from public.squads s
    where s.id = squad_id and s.leader_id = auth.uid() and s.status <> 'DISBANDED'));

create or replace function public.guard_squad_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  is_leader boolean := false;
begin
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  if NEW.id is distinct from OLD.id
    or NEW.player_id is distinct from OLD.player_id
    or NEW.role is distinct from OLD.role
    or NEW.squad_id is distinct from OLD.squad_id
    or NEW.created_at is distinct from OLD.created_at then
    raise exception 'Only staff can move warriors between squads or ranks.';
  end if;
  select exists(select 1 from public.squads s
    where s.id = OLD.squad_id and s.leader_id = me and s.status <> 'DISBANDED')
    into is_leader;
  if OLD.status = 'PENDING' and NEW.status in ('ACCEPTED','DECLINED')
    and (OLD.player_id = me or is_leader) then
    return NEW;
  end if;
  raise exception 'Squad update not allowed.';
end $$;

-- ============ tryouts: public insert policy and privilege ============
drop policy if exists "anon submit tryout" on public.tryout_requests;
create policy "anon submit tryout"
  on public.tryout_requests for insert to anon, authenticated
  with check (status = 'PENDING' and char_length(name) > 0 and char_length(contact) > 0
    and (website_url is null or website_url = ''));
grant insert on public.tryout_requests to anon, authenticated;
