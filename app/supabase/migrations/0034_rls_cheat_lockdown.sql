-- VIK Clan migration 0034: RLS cheat lockdown (see docs/rls-audit.md).
-- Run AFTER 0033. Idempotent: every statement is DROP IF EXISTS /
-- CREATE OR REPLACE guarded, so re-running is safe.
--
-- Closes: profile privilege escalation (F1), join/oath bypass + waitlist
-- queue-jumping (F2), match self-confirm (F3), audit forgery (F6), infinite
-- Glory mint (F7), quest fraud (F8), rating takeover/spoof (F9), squad
-- theft/self-promote (F10), free gift accept (F11), tester accept (F12),
-- avatar griefing (F13), evidence/dispute spam scoping.
-- Kept open with TODO (later RPC tasks, see audit §4): notifications INSERT
-- (F4), squad invites for non-staff leaders, match-evidence storage uploads.

-- ============ 0. helper (also in 0001/0028; repeated for standalone runs) ============
create or replace function public.is_clan_role(required text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = any(required) and p.status = 'ACTIVE'
  );
$$;

-- ============ F1. profiles: freeze privileged columns for non-staff ============
-- Self-writes that must keep working: updateOwnProfile allow-list,
-- swear() (oath_accepted_at), heartbeat (last_login_at).
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ============ F6. audit_logs: actors can only append as themselves ============
-- Verified: every client call site inserts actor_id = own id.
drop policy if exists "members append audit" on public.audit_logs;
create policy "members append audit" on public.audit_logs
  for insert to authenticated with check (actor_id = auth.uid());

-- ============ F2. joins: ACTIVE + oath-sworn; waitlist position server-set ============
drop policy if exists "members join competitions" on public.competition_participants;
create policy "members join competitions" on public.competition_participants
  for insert to authenticated with check (
    player_id = auth.uid()
    and exists (select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE' and p.oath_accepted_at is not null)
  );
drop policy if exists "members join waitlist" on public.competition_waitlist;
create policy "members join waitlist" on public.competition_waitlist
  for insert to authenticated with check (
    player_id = auth.uid()
    and exists (select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE' and p.oath_accepted_at is not null)
  );
-- Queue jumping is impossible: position is always assigned server-side.
create or replace function public.assign_waitlist_position()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(max(position), 0) + 1 into NEW.position
    from public.competition_waitlist
    where competition_id = NEW.competition_id;
  return NEW;
end $$;
drop trigger if exists waitlist_position on public.competition_waitlist;
create trigger waitlist_position
  before insert on public.competition_waitlist
  for each row execute function public.assign_waitlist_position();

-- ============ F3. matches: state machine for non-staff ============
drop policy if exists "players submit own matches" on public.matches;
create policy "players submit own matches" on public.matches
  for update to authenticated
  using (auth.uid() = player_a_id or auth.uid() = player_b_id
    or public.is_clan_role(array['OWNER','ADMIN','MODERATOR']))
  with check (auth.uid() = player_a_id or auth.uid() = player_b_id
    or public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));
-- Anyone may flip an expired match to OVERDUE (preserves markOverdue for
-- viewers who are neither participants nor staff; strictly deadline-gated).
drop policy if exists "anyone marks overdue" on public.matches;
create policy "anyone marks overdue" on public.matches
  for update to authenticated
  using (status in ('SCHEDULED','RESULT_SUBMITTED') and deadline is not null and deadline < now())
  with check (status = 'OVERDUE');

create or replace function public.guard_match_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  is_part boolean := (OLD.player_a_id = me or OLD.player_b_id = me);
  winner uuid := case
    when NEW.score_a is null or NEW.score_b is null then null
    when NEW.score_a > NEW.score_b then NEW.player_a_id
    when NEW.score_a < NEW.score_b then NEW.player_b_id
    else null end;
begin
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  if not is_part then
    -- Non-participants may only perform the deadline-gated overdue sweep
    -- (also covered by the "anyone marks overdue" policy above).
    if OLD.status in ('SCHEDULED','RESULT_SUBMITTED') and NEW.status = 'OVERDUE'
      and OLD.deadline is not null and OLD.deadline < now() then
      return NEW;
    end if;
    raise exception 'Only participants can update this match.';
  end if;
  -- Fixtures and staff-only columns are immutable for players.
  if (NEW.competition_id is distinct from OLD.competition_id
      or NEW.round_id is distinct from OLD.round_id
      or NEW.player_a_id is distinct from OLD.player_a_id
      or NEW.player_b_id is distinct from OLD.player_b_id
      or NEW.moderation_comment is distinct from OLD.moderation_comment
      or NEW.forfeit_player_id is distinct from OLD.forfeit_player_id) then
    raise exception 'Only staff can change fixtures or moderation state.';
  end if;
  -- 1. submit: SCHEDULED/OVERDUE -> RESULT_SUBMITTED by a participant.
  if OLD.status in ('SCHEDULED','OVERDUE') and NEW.status = 'RESULT_SUBMITTED' then
    if NEW.score_a is null or NEW.score_b is null or NEW.score_a < 0 or NEW.score_b < 0 then
      raise exception 'Scores must be whole numbers >= 0.';
    end if;
    if NEW.submitted_by is distinct from me or NEW.submitted_at is null then
      raise exception 'Submission must be attributed to you.';
    end if;
    if NEW.forfeit_claimed_by is not null
      or NEW.confirmed_by is not null or NEW.confirmed_at is not null then
      raise exception 'Only staff can confirm results.';
    end if;
    NEW.winner_id := winner;
    return NEW;
  end if;
  -- 2. opponent confirm: RESULT_SUBMITTED -> CONFIRMED by the other side.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'CONFIRMED' then
    if OLD.submitted_by is null or OLD.submitted_by = me then
      raise exception 'The submitter cannot confirm their own result.';
    end if;
    if OLD.forfeit_claimed_by is not null then
      raise exception 'Forfeit claim pending moderator review.';
    end if;
    if NEW.score_a is distinct from OLD.score_a or NEW.score_b is distinct from OLD.score_b then
      raise exception 'Scores cannot change on confirm.';
    end if;
    if NEW.confirmed_by is distinct from me or NEW.confirmed_at is null then
      raise exception 'Confirmation must be attributed to you.';
    end if;
    NEW.winner_id := winner;
    return NEW;
  end if;
  -- 3. dispute: participant flags RESULT_SUBMITTED -> DISPUTED.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'DISPUTED' then
    if NEW.score_a is distinct from OLD.score_a or NEW.score_b is distinct from OLD.score_b
      or NEW.submitted_by is distinct from OLD.submitted_by then
      raise exception 'Scores cannot change on dispute.';
    end if;
    return NEW;
  end if;
  -- 4. forfeit claim: opponent stamps forfeit_claimed_by = self.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'RESULT_SUBMITTED'
    and OLD.forfeit_claimed_by is null and NEW.forfeit_claimed_by = me
    and OLD.submitted_by is distinct from me then
    return NEW;
  end if;
  -- 5. overdue sweep by a participant viewer.
  if OLD.status in ('SCHEDULED','RESULT_SUBMITTED') and NEW.status = 'OVERDUE'
    and OLD.deadline is not null and OLD.deadline < now() then
    return NEW;
  end if;
  raise exception 'Match update not allowed.';
end $$;
drop trigger if exists matches_guard on public.matches;
create trigger matches_guard
  before update on public.matches
  for each row execute function public.guard_match_update();

-- ============ evidence/dispute spam scoping (LOW) ============
drop policy if exists "members upload evidence" on public.match_evidence;
create policy "members upload evidence" on public.match_evidence
  for insert to authenticated with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.matches m
      where m.id = match_id and (m.player_a_id = auth.uid() or m.player_b_id = auth.uid()))
  );
drop policy if exists "members open disputes" on public.disputes;
create policy "members open disputes" on public.disputes
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (select 1 from public.matches m
      where m.id = match_id and (m.player_a_id = auth.uid() or m.player_b_id = auth.uid()))
  );

-- ============ F5. challenges: insert guards + state machine ============
-- Ghost sweep by any viewer (preserves expireStaleOpenCalls).
drop policy if exists "anyone sweeps expired calls" on public.challenges;
create policy "anyone sweeps expired calls" on public.challenges
  for update to authenticated
  using (is_open = true and status = 'PENDING' and expires_at is not null and expires_at < now())
  with check (status = 'CANCELLED');

create or replace function public.guard_challenge_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  balance int := 0;
  holder uuid := null;
  dupes int := 0;
begin
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  if NEW.challenger_id is distinct from me then
    raise exception 'You can only issue challenges as yourself.';
  end if;
  if NEW.is_open = true and NEW.type != 'FRIENDLY' then
    raise exception 'Only friendlies can be open calls.';
  end if;
  if NEW.is_open = true then
    NEW.opponent_id := null;
    NEW.expires_at := now() + interval '24 hours';
  elsif NEW.opponent_id is null and (NEW.opponent_label is null or NEW.opponent_label = '') then
    raise exception 'Name an opponent.';
  end if;
  if NEW.forced = true then
    if NEW.type != 'HEAD' then
      raise exception 'Only Calls for a Head can be unrefusable.';
    end if;
    if NEW.opponent_id is null then
      raise exception 'Unrefusable calls target a clan member.';
    end if;
    select coalesce(sum(amount), 0) into balance from public.xp_ledger where player_id = me;
    if balance < 100 then
      raise exception 'Unrefusable calls require holding 100 GP.';
    end if;
  end if;
  if NEW.for_throne = true then
    if NEW.type != 'HONOR' then
      raise exception 'Throne battles must be Honor Duels.';
    end if;
    select holder_id into holder from public.throne_reigns
      where ended_at is null order by started_at desc limit 1;
    if holder is null then
      raise exception 'The throne is vacant - ask an admin to crown a champion.';
    end if;
    if NEW.opponent_id is distinct from holder then
      raise exception 'Throne challenges must target the current holder.';
    end if;
    select count(*) into dupes from public.challenges
      where challenger_id = me and for_throne = true
        and status in ('PENDING','ACCEPTED','RESULT_SUBMITTED');
    if dupes > 0 then
      raise exception 'You already have an active throne challenge — resolve it first.';
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists challenges_insert_guard on public.challenges;
create trigger challenges_insert_guard
  before insert on public.challenges
  for each row execute function public.guard_challenge_insert();

create or replace function public.guard_challenge_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  is_part boolean := (OLD.challenger_id = me or OLD.opponent_id = me);
begin
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  -- Immutable for players across every transition.
  if (NEW.challenger_id is distinct from OLD.challenger_id
      or NEW.type is distinct from OLD.type
      or NEW.forced is distinct from OLD.forced
      or NEW.for_throne is distinct from OLD.for_throne
      or NEW.opponent_label is distinct from OLD.opponent_label
      or NEW.conditions is distinct from OLD.conditions
      or NEW.stakes is distinct from OLD.stakes) then
    raise exception 'Only staff can change challenge terms.';
  end if;
  -- a. open-mat accept: first taker becomes the opponent.
  if OLD.is_open = true and OLD.status = 'PENDING' and OLD.opponent_id is null
    and NEW.status = 'ACCEPTED' and NEW.opponent_id = me and NEW.is_open = false
    and OLD.challenger_id is distinct from me then
    return NEW;
  end if;
  -- b. ghost sweep by any viewer.
  if OLD.is_open = true and OLD.status = 'PENDING'
    and OLD.expires_at is not null and OLD.expires_at < now()
    and NEW.status = 'CANCELLED' then
    return NEW;
  end if;
  if not is_part then
    raise exception 'Only participants can update this battle.';
  end if;
  -- c. respond: opponent accepts, or declines (never a forced call).
  if OLD.status = 'PENDING' and OLD.opponent_id = me
    and NEW.status in ('ACCEPTED','DECLINED')
    and (NEW.status = 'ACCEPTED' or OLD.forced = false) then
    return NEW;
  end if;
  -- d. submit: ACCEPTED -> RESULT_SUBMITTED with scores by a participant.
  if OLD.status = 'ACCEPTED' and NEW.status = 'RESULT_SUBMITTED'
    and OLD.submitted_by is null and NEW.submitted_by = me
    and NEW.score_a is not null and NEW.score_b is not null
    and NEW.score_a >= 0 and NEW.score_b >= 0 then
    return NEW;
  end if;
  -- e. confirm: RESULT_SUBMITTED -> COMPLETED by the other side.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'COMPLETED'
    and OLD.submitted_by is not null and OLD.submitted_by is distinct from me
    and NEW.score_a is not distinct from OLD.score_a
    and NEW.score_b is not distinct from OLD.score_b
    and NEW.submitted_by is not distinct from OLD.submitted_by then
    return NEW;
  end if;
  -- f. cancel: challenger anytime (PENDING/ACCEPTED); opponent only friendlies.
  if OLD.status in ('PENDING','ACCEPTED') and NEW.status = 'CANCELLED'
    and (OLD.challenger_id = me or OLD.type = 'FRIENDLY') then
    return NEW;
  end if;
  -- g. renew: caller extends their own open call.
  if OLD.challenger_id = me and OLD.is_open = true and OLD.status = 'PENDING'
    and NEW.status = 'PENDING' and NEW.expires_at > OLD.expires_at then
    return NEW;
  end if;
  raise exception 'Battle update not allowed.';
end $$;
drop trigger if exists challenges_guard on public.challenges;
create trigger challenges_guard
  before update on public.challenges
  for each row execute function public.guard_challenge_update();

-- ============ F9. ratings: no takeover, scores match dims ============
drop policy if exists "members update own rating" on public.ratings;
create policy "members update own rating" on public.ratings
  for update to authenticated
  using (rater_id = auth.uid()) with check (rater_id = auth.uid());
alter table public.ratings drop constraint if exists ratings_score_dims_check;
alter table public.ratings add check (
  tactical is null or fairplay is null or connection is null
  or score = round((tactical + fairplay + connection) / 3.0)
);

-- ============ F10. squads: no leadership transfer, no self-promote ============
drop policy if exists "leaders manage squads" on public.squads;
create policy "leaders manage squads" on public.squads
  for update to authenticated
  using (leader_id = auth.uid()) with check (leader_id = auth.uid());
create or replace function public.guard_squad_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  if NEW.player_id is distinct from OLD.player_id
    or NEW.role is distinct from OLD.role
    or NEW.squad_id is distinct from OLD.squad_id then
    raise exception 'Only staff can move warriors between squads or ranks.';
  end if;
  if OLD.player_id is distinct from auth.uid() then
    raise exception 'You can only answer your own squad invite.';
  end if;
  if OLD.status = 'PENDING' and NEW.status in ('ACCEPTED','DECLINED') then
    return NEW;
  end if;
  raise exception 'Squad update not allowed.';
end $$;
drop trigger if exists squad_members_guard on public.squad_members;
create trigger squad_members_guard
  before update on public.squad_members
  for each row execute function public.guard_squad_member_update();

-- ============ F11/F7/F8. economy writes move behind RPCs ============
drop policy if exists "parties answer gifts" on public.gp_requests;
drop policy if exists "members earn xp" on public.xp_ledger;
drop policy if exists "members claim quests" on public.quest_claims;

-- ============ F12. tryouts: testers touch verdict columns only ============
drop policy if exists "anon submit tryout" on public.tryout_requests;
create policy "anon submit tryout"
  on public.tryout_requests for insert to anon, authenticated
  with check (status = 'PENDING' and char_length(name) > 0 and char_length(contact) > 0);
create or replace function public.guard_tryout_verdict()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_clan_role(array['OWNER','ADMIN']) then
    return NEW;
  end if;
  if (NEW.status is distinct from OLD.status
      or NEW.admin_note is distinct from OLD.admin_note
      or NEW.assigned_tester_id is distinct from OLD.assigned_tester_id
      or NEW.name is distinct from OLD.name
      or NEW.contact is distinct from OLD.contact
      or NEW.email is distinct from OLD.email
      or NEW.note is distinct from OLD.note) then
    raise exception 'Testers can only report the verdict, never resolve requests.';
  end if;
  return NEW;
end $$;
drop trigger if exists tryout_verdict_guard on public.tryout_requests;
create trigger tryout_verdict_guard
  before update on public.tryout_requests
  for each row execute function public.guard_tryout_verdict();

-- ============ F13. avatars: everyone reads, owners write ============
drop policy if exists "members manage own avatar" on storage.objects;
-- SELECT ("members read avatars") and clan-assets policies are untouched.
create policy "members upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "members update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "members delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ secured economy RPCs (SECURITY DEFINER) ============
-- Shared season label: S<year>.
create or replace function public.vik_season()
returns text language sql stable set search_path = public as $$
  select 'S' || extract(year from now())::text;
$$;

-- Match rewards: winner 30 / draw 15 / loser 10 + First Blood + streaks.
-- Same reasons, names and notices as the client code it replaces.
create or replace function public.grant_match_rewards(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
  a_won boolean; is_draw boolean;
  pid uuid;
  verified int;
  streak int := 0; longest int := 0;
  r record;
  mine int; theirs int;
begin
  select * into m from public.matches where id = p_match_id;
  if m is null then raise exception 'Match not found.'; end if;
  if m.status not in ('CONFIRMED','FORFEIT') then
    raise exception 'Match is not final.';
  end if;
  if m.score_a is null or m.score_b is null then
    raise exception 'Match has no score.';
  end if;
  if auth.uid() is distinct from m.player_a_id
    and auth.uid() is distinct from m.player_b_id
    and not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only participants can settle rewards.';
  end if;
  a_won := m.score_a > m.score_b;
  is_draw := m.score_a = m.score_b;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (m.player_a_id, case when a_won then 30 when is_draw then 15 else 10 end,
      case when a_won then 'match-win' when is_draw then 'match-draw' else 'match-played' end,
      'match', m.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (m.player_b_id, case when not a_won and not is_draw then 30 when is_draw then 15 else 10 end,
      case when not a_won and not is_draw then 'match-win' when is_draw then 'match-draw' else 'match-played' end,
      'match', m.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  foreach pid in array array[m.player_a_id, m.player_b_id] loop
    select count(*) into verified from (
      select 1 from public.matches
        where (player_a_id = pid or player_b_id = pid)
          and status in ('CONFIRMED','FORFEIT')
      union all
      select 1 from public.challenges
        where (challenger_id = pid or opponent_id = pid) and status = 'COMPLETED'
    ) s;
    if verified = 1 and not exists (
        select 1 from public.achievements where player_id = pid and type = 'FIRST_BLOOD') then
      insert into public.achievements (player_id, competition_id, type, name, description)
        values (pid, m.competition_id, 'FIRST_BLOOD', 'First Blood', 'Completed first verified clan match.');
      insert into public.notifications (user_id, type, title, message)
        values (pid, 'COMPETITION_FINISHED', 'Achievement: First Blood', 'You completed your first verified clan match.');
    end if;
    streak := 0; longest := 0;
    for r in select player_a_id, player_b_id, score_a, score_b from public.matches
        where (player_a_id = pid or player_b_id = pid)
          and status in ('CONFIRMED','FORFEIT')
        order by confirmed_at asc nulls last loop
      if r.score_a is null or r.score_b is null then continue; end if;
      mine := case when r.player_a_id = pid then r.score_a else r.score_b end;
      theirs := case when r.player_a_id = pid then r.score_b else r.score_a end;
      if mine > theirs then streak := streak + 1; longest := greatest(longest, streak);
      else streak := 0; end if;
    end loop;
    if longest >= 5 and not exists (
        select 1 from public.achievements where player_id = pid and type = 'STREAK_5') then
      insert into public.achievements (player_id, competition_id, type, name, description)
        values (pid, m.competition_id, 'STREAK_5', 'War Streak x5', 'Consecutive verified wins.');
      insert into public.notifications (user_id, type, title, message)
        values (pid, 'COMPETITION_FINISHED', 'Badge: War Streak x5', 'A new battle honor is yours.');
    end if;
    if longest >= 10 and not exists (
        select 1 from public.achievements where player_id = pid and type = 'STREAK_10') then
      insert into public.achievements (player_id, competition_id, type, name, description)
        values (pid, m.competition_id, 'STREAK_10', 'Unbroken x10', 'Consecutive verified wins.');
      insert into public.notifications (user_id, type, title, message)
        values (pid, 'COMPETITION_FINISHED', 'Badge: Unbroken x10', 'A new battle honor is yours.');
    end if;
  end loop;
end $$;
revoke all on function public.grant_match_rewards(uuid) from public;
grant execute on function public.grant_match_rewards(uuid) to authenticated;

-- Battle rewards: winner 25 / draw 15 / loser 10 + 100 bounty on forced calls.
create or replace function public.grant_battle_rewards(p_challenge_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  a_won boolean; is_draw boolean;
  opp uuid;
  winner uuid;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if c is null then raise exception 'Battle not found.'; end if;
  if c.status != 'COMPLETED' then raise exception 'Battle is not final.'; end if;
  if auth.uid() is distinct from c.challenger_id
    and (c.opponent_id is null or auth.uid() is distinct from c.opponent_id)
    and not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only participants can settle rewards.';
  end if;
  a_won := c.score_a > c.score_b;
  is_draw := c.score_a = c.score_b;
  opp := c.opponent_id;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (c.challenger_id, case when a_won then 25 when is_draw then 15 else 10 end,
      'battle', 'battle', c.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  if opp is not null then
    insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
      values (opp, case when not a_won and not is_draw then 25 when is_draw then 15 else 10 end,
        'battle', 'battle', c.id::text, public.vik_season())
      on conflict (player_id, ref_type, ref_id, reason) do nothing;
  end if;
  if c.forced = true and not is_draw then
    winner := case when a_won then c.challenger_id else opp end;
    if winner is not null then
      insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
        values (winner, 100, 'bounty', 'battle', c.id::text, public.vik_season())
        on conflict (player_id, ref_type, ref_id, reason) do nothing;
    end if;
  end if;
end $$;
revoke all on function public.grant_battle_rewards(uuid) from public;
grant execute on function public.grant_battle_rewards(uuid) to authenticated;

-- Quest claim: progress re-validated in SQL (Casa day / Monday boundaries).
create or replace function public.claim_quest(p_quest_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  daily text[] := array['first-blood','wanderer','caller','squire'];
  weekly text[] := array['veteran','rival'];
  kind text;
  xp int;
  v_day timestamptz := date_trunc('day', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
  v_week timestamptz := date_trunc('week', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
  since timestamptz;
  period text;
  done int := 0; target int := 1;
begin
  if p_quest_key = any(daily) then kind := 'daily';
  elsif p_quest_key = any(weekly) then kind := 'weekly';
  else raise exception 'Unknown quest.'; end if;
  if kind = 'daily' then
    since := v_day; period := (v_day at time zone 'Africa/Casablanca')::date::text;
  else
    since := v_week; period := (v_week at time zone 'Africa/Casablanca')::date::text;
  end if;
  case p_quest_key
    when 'first-blood' then xp := 30; target := 1;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since;
      done := least(done, 1);
    when 'wanderer' then xp := 60; target := 2;
      select count(*) into done from (
        select distinct case when player_a_id = me then player_b_id else player_a_id end
        from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since
      ) s;
      done := least(done, 2);
    when 'caller' then xp := 15; target := 1;
      select count(*) into done from public.challenges
        where challenger_id = me and created_at >= since;
      done := least(done, 1);
    when 'squire' then xp := 20; target := 1;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT')
          and confirmed_by = me and confirmed_at >= since;
      done := least(done, 1);
    when 'veteran' then xp := 80; target := 3;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since;
      done := least(done, 3);
    when 'rival' then xp := 50; target := 1;
      select count(*) into done from public.challenges
        where type = 'REMATCH' and (challenger_id = me or opponent_id = me)
          and created_at >= since;
      done := least(done, 1);
  end case;
  if done < target then raise exception 'Quest not complete yet.'; end if;
  begin
    insert into public.quest_claims (player_id, quest_key, period)
      values (me, p_quest_key, period);
  exception when unique_violation then
    raise exception 'Already claimed.';
  end;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (me, xp, 'quest:' || p_quest_key, 'quest', p_quest_key || ':' || period, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
end $$;
revoke all on function public.claim_quest(text) from public;
grant execute on function public.claim_quest(text) to authenticated;

-- Gift answer: balance-checked paired transfer, giver only.
create or replace function public.answer_gift(p_request_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  g record;
  balance int;
begin
  select * into g from public.gp_requests where id = p_request_id;
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

-- Onboarding reward: +80 once the name/tag/phone gate is complete.
create or replace function public.claim_onboarding_reward()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ok boolean;
begin
  select (display_name is not null and display_name != ''
    and known_name is not null and known_name != ''
    and whatsapp is not null and whatsapp != '')
    into ok from public.profiles where id = me;
  if coalesce(ok, false) = false then
    raise exception 'Complete your name, warrior tag and phone first.';
  end if;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (me, 80, 'onboarding-profile', 'onboarding', me::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  return true;
end $$;
revoke all on function public.claim_onboarding_reward() from public;
grant execute on function public.claim_onboarding_reward() to authenticated;

-- Throne settle: validated transfer/defense, pledges follow the throne.
-- Replaces the client-side settle (which RLS denied for non-staff).
create or replace function public.settle_throne_battle(p_challenge_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  c record;
  reign record;
  winner uuid;
  now_ts timestamptz := now();
  s record;
  moved int := 0;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if c is null then raise exception 'Battle not found.'; end if;
  if c.status != 'COMPLETED' or c.for_throne != true then
    raise exception 'Not a completed throne battle.';
  end if;
  if c.score_a is null or c.score_b is null or c.opponent_id is null then
    raise exception 'Throne battle has no score.';
  end if;
  if auth.uid() is distinct from c.challenger_id
    and auth.uid() is distinct from c.opponent_id
    and not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only participants can settle the throne.';
  end if;
  select * into reign from public.throne_reigns
    where ended_at is null order by started_at desc limit 1;
  if reign is null or reign.holder_id is distinct from c.opponent_id then
    return 'draw';
  end if;
  winner := case
    when c.score_a > c.score_b then c.challenger_id
    when c.score_b > c.score_a then c.opponent_id
    else null end;
  if winner is null or winner = reign.holder_id then
    update public.throne_reigns set defenses = reign.defenses + 1 where id = reign.id;
    return case when winner is not null then 'defended' else 'draw' end;
  end if;
  update public.throne_reigns set ended_at = now_ts where id = reign.id;
  insert into public.throne_reigns (holder_id, won_from)
    values (c.challenger_id, reign.holder_id);
  for s in select id, challenger_id from public.challenges
      where for_throne = true and opponent_id = reign.holder_id
        and status in ('PENDING','ACCEPTED')
        and challenger_id is distinct from c.challenger_id loop
    update public.challenges
      set opponent_id = c.challenger_id, status = 'PENDING',
        responded_at = null, updated_at = now_ts
      where id = s.id;
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
      values (s.challenger_id, 'COMPETITION_INVITATION', 'Pledge redirected',
        'The throne changed hands — your challenge now targets the new champion.',
        'battle', s.id);
    moved := moved + 1;
  end loop;
  if moved > 0 then
    insert into public.notifications (user_id, type, title, message)
      values (c.challenger_id, 'COMPETITION_INVITATION', 'Throne pledges incoming',
        'Redirected challenges await your answer as the new champion.');
  end if;
  return 'transfer';
end $$;
revoke all on function public.settle_throne_battle(uuid) from public;
grant execute on function public.settle_throne_battle(uuid) to authenticated;

-- ============ TODO (kept open; later RPC tasks, see docs/rls-audit.md §4) ============
-- notifications INSERT stays open (central notify() used by every flow).
-- squad invites by non-staff leaders still fail RLS (needs create_squad RPC).
-- match-evidence storage uploads stay any-path (row gate above is the check).
