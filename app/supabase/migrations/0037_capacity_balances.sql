-- VIK Clan migration 0037: server-side capacity + balances.
-- Run AFTER 0036. Idempotent: IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
--
-- join_competition(p_code): all join checks + capacity under a FOR UPDATE row
--   lock on the competition. Concurrent last-slot joins serialize: exactly one
--   wins, the other gets {ok:false, code:'COMPETITION_FULL'} (no throw) so the
--   client can offer the waitlist via join_waitlist() as before.
-- leave_competition: member leave only before start (not ACTIVE/FINISHED/ARCHIVED).
-- answer_gift (re-stated with locks): request row + giver profile row locked,
--   so concurrent accepts serialize and the balance can never go negative.
-- Revokes: member INSERT + DELETE on competition_participants (joins/leaves go
--   through the RPCs; staff ALL stays for replacements). gp_requests member
--   UPDATE was already removed in 0034; askGift direct INSERT stays (creates a
--   request only — no economy effect; requester=self + 5–500 table check).
-- Forced 100 GP call check: already a BEFORE INSERT trigger (0034
--   guard_challenge_insert) — verified, no change needed.

-- ============ join: everything validated under lock ============
create or replace function public.join_competition(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  code text := upper(trim(coalesce(p_code, '')));
  prof record;
  c record;
  cnt int;
  already boolean;
begin
  if me is null then raise exception 'Not logged in.'; end if;
  if code = '' then raise exception 'Competition not found.'; end if;
  select * into prof from public.profiles where id = me;
  if prof is null or prof.status != 'ACTIVE' then
    raise exception 'Only ACTIVE clan members can join competitions (Rule 2).';
  end if;
  if prof.oath_accepted_at is null then
    raise exception 'Swear the Viking Oath before joining competitions.';
  end if;
  select * into c from public.competitions
    where join_code = code and is_deleted = false for update;
  if c is null then raise exception 'Competition not found.'; end if;
  if c.join_enabled = false or c.status != 'REGISTRATION_OPEN' then
    raise exception 'Registration is closed for this competition.';
  end if;
  if c.registration_start is not null and c.registration_start > now() then
    raise exception 'Registration is closed for this competition.';
  end if;
  if c.registration_deadline is not null and c.registration_deadline < now() then
    raise exception 'Registration is closed for this competition.';
  end if;
  select exists(select 1 from public.competition_participants
    where competition_id = c.id and player_id = me) into already;
  if already then
    raise exception 'You are already registered for this competition.';
  end if;
  -- Fresh count under the row lock: the loser of a last-slot race blocks
  -- here, then sees the winner's committed row.
  select count(*) into cnt from public.competition_participants
    where competition_id = c.id;
  if cnt >= c.max_players then
    return jsonb_build_object('ok', false, 'code', 'COMPETITION_FULL',
      'registered', cnt, 'max', c.max_players);
  end if;
  begin
    insert into public.competition_participants (competition_id, player_id)
      values (c.id, me);
  exception when unique_violation then
    raise exception 'You are already registered for this competition.';
  end;
  return jsonb_build_object('ok', true, 'competition_id', c.id,
    'registered', cnt + 1, 'max', c.max_players);
end $$;
revoke all on function public.join_competition(text) from public;
grant execute on function public.join_competition(text) to authenticated;

-- ============ leave: members only before start ============
create or replace function public.leave_competition(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c record;
  gone boolean;
begin
  if me is null then raise exception 'Not logged in.'; end if;
  select * into c from public.competitions
    where id = p_competition_id and is_deleted = false for update;
  if c is null then raise exception 'Competition not found.'; end if;
  if c.status in ('ACTIVE','FINISHED','ARCHIVED') then
    raise exception 'This competition has started — ask a moderator to replace you.';
  end if;
  delete from public.competition_participants
    where competition_id = c.id and player_id = me
    returning true into gone;
  if coalesce(gone, false) = false then
    raise exception 'You are not registered for this competition.';
  end if;
  return jsonb_build_object('ok', true, 'competition_id', c.id);
end $$;
revoke all on function public.leave_competition(uuid) from public;
grant execute on function public.leave_competition(uuid) to authenticated;

-- ============ answer_gift, re-stated with serialization locks ============
-- Same contract + messages as 0034, plus: the request row and the giver's
-- profile row are locked, so two concurrent accepts (double-click / two tabs)
-- serialize — the loser sees 'Already answered.' and the paired ledger rows
-- are written once. Balances can never go negative through gifts.
create or replace function public.answer_gift(p_request_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  g record;
  balance int;
begin
  select * into g from public.gp_requests where id = p_request_id for update;
  if g is null then raise exception 'Request not found.'; end if;
  if g.status != 'PENDING' then raise exception 'Already answered.'; end if;
  if auth.uid() is distinct from g.giver_id then
    raise exception 'Only the giver can answer.';
  end if;
  if not p_accept then
    update public.gp_requests set status = 'DECLINED', responded_at = now() where id = p_request_id;
    insert into public.notifications (user_id, type, title, message)
      values (g.requester_id, 'COMPETITION_FINISHED', 'Favor declined', 'They refused the Glory request.');
    return;
  end if;
  -- Serialize this giver's spending: concurrent accepts for the same giver
  -- wait here, then re-read a post-commit balance.
  perform 1 from public.profiles where id = g.giver_id for update;
  select coalesce(sum(amount), 0) into balance from public.xp_ledger where player_id = g.giver_id;
  if balance < g.amount then
    raise exception 'Not enough Glory (holds % GP).', balance;
  end if;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (g.giver_id, -g.amount, 'gift-sent', 'gift', g.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (g.requester_id, g.amount, 'gift-received', 'gift', g.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  update public.gp_requests set status = 'ACCEPTED', responded_at = now() where id = p_request_id;
  insert into public.notifications (user_id, type, title, message)
    values (g.requester_id, 'COMPETITION_FINISHED',
      '+' || g.amount || ' Glory received', 'Your brother answered your call.');
end $$;
revoke all on function public.answer_gift(uuid, boolean) from public;
grant execute on function public.answer_gift(uuid, boolean) to authenticated;

-- ============ revoke direct member writes (RPCs only now) ============
drop policy if exists "members join competitions" on public.competition_participants;
drop policy if exists "members leave competitions" on public.competition_participants;
-- Staff ALL on participants stays (player replacements). Member waitlist
-- INSERT/DELETE stays (join_waitlist flow; ACTIVE+oath checked, position
-- server-assigned). gp_requests member UPDATE stays removed (0034).
