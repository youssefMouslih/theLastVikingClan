-- VIK Clan migration 0035: server-side match confirmation.
-- Run AFTER 0034. Idempotent: DROP IF EXISTS / CREATE OR REPLACE throughout.
--
-- The confirming client no longer runs side effects. One transaction
-- (confirm_match / admin_set_result / award_match_forfeit, all SECURITY
-- DEFINER over the shared vik_finalize_match) does: validation, CONFIRMED /
-- FORFEIT + winner, idempotent XP, First Blood, streaks over matches AND
-- battles, round advance, submitter notice, staff audit.
-- Properties: concurrent confirms serialize on the match row lock (second gets
-- 'Nothing to confirm.'); XP rows are unique per (player, ref, reason) so a
-- retry can never double-award; closing the tab mid-confirm still commits
-- everything server-side. Returns a purge flag (round just completed);
-- evidence deletion itself stays client-side (storage + rows, best-effort).

-- Shared finalizer. NOT exposed: execute revoked so it is only reachable
-- through the three public wrappers below (same-transaction calls inherit
-- the wrapper's definer rights for the permission check).
create or replace function public.vik_finalize_match(
  p_match_id uuid,
  p_status text,
  p_score_a int,
  p_score_b int,
  p_confirmed_by uuid,
  p_forfeit_player uuid,
  p_audit_action text,
  p_audit_new jsonb,
  p_audit_reason text,
  p_notice_title text,
  p_notice_msg text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  m record;
  winner uuid;
  pid uuid;
  verified int;
  streak int := 0;
  longest int := 0;
  r record;
  open_n int;
  cur_rn int;
  next_id uuid := null;
  round_complete boolean := false;
begin
  select * into m from public.matches where id = p_match_id;
  if m is null then raise exception 'Match not found.'; end if;
  winner := case
    when p_score_a > p_score_b then m.player_a_id
    when p_score_a < p_score_b then m.player_b_id
    else null end;
  update public.matches
    set status = p_status,
      score_a = p_score_a,
      score_b = p_score_b,
      confirmed_by = p_confirmed_by,
      confirmed_at = now(),
      winner_id = winner,
      forfeit_player_id = p_forfeit_player,
      forfeit_claimed_by = null,
      updated_at = now()
    where id = p_match_id;
  -- Glory: winner 30 / draw 15 / loser 10, idempotent per (player, ref, reason).
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (m.player_a_id,
      case when p_score_a > p_score_b then 30 when p_score_a = p_score_b then 15 else 10 end,
      case when p_score_a > p_score_b then 'match-win' when p_score_a = p_score_b then 'match-draw' else 'match-played' end,
      'match', p_match_id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (m.player_b_id,
      case when p_score_b > p_score_a then 30 when p_score_a = p_score_b then 15 else 10 end,
      case when p_score_b > p_score_a then 'match-win' when p_score_a = p_score_b then 'match-draw' else 'match-played' end,
      'match', p_match_id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  -- First Blood + win streaks over matches AND battles.
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
    streak := 0;
    longest := 0;
    for r in
      select played_at, mine, theirs from (
        select confirmed_at as played_at,
          case when player_a_id = pid then score_a else score_b end as mine,
          case when player_a_id = pid then score_b else score_a end as theirs
        from public.matches
        where (player_a_id = pid or player_b_id = pid)
          and status in ('CONFIRMED','FORFEIT')
          and score_a is not null and score_b is not null
        union all
        select updated_at as played_at,
          case when challenger_id = pid then score_a else score_b end as mine,
          case when challenger_id = pid then score_b else score_a end as theirs
        from public.challenges
        where (challenger_id = pid or opponent_id = pid) and status = 'COMPLETED'
          and score_a is not null and score_b is not null and opponent_id is not null
      ) s order by played_at asc nulls last
    loop
      if r.mine > r.theirs then
        streak := streak + 1;
        longest := greatest(longest, streak);
      else
        streak := 0;
      end if;
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
  -- Round advance: close the round when every match is final, open the next.
  if m.round_id is not null then
    select count(*) into open_n from public.matches
      where competition_id = m.competition_id and round_id = m.round_id
        and status not in ('CONFIRMED','FORFEIT','CANCELLED');
    if open_n = 0 then
      update public.rounds set status = 'COMPLETED'
        where id = m.round_id and status != 'COMPLETED';
      select round_number into cur_rn from public.rounds where id = m.round_id;
      select id into next_id from public.rounds
        where competition_id = m.competition_id and round_number > cur_rn
        order by round_number asc limit 1;
      if next_id is not null then
        update public.rounds set status = 'ACTIVE'
          where id = next_id and status = 'SCHEDULED';
      end if;
      round_complete := true;
    end if;
  end if;
  -- Submitter notice (skipped for staff-set results with no submitter).
  if m.submitted_by is not null and m.submitted_by is distinct from p_confirmed_by then
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
      values (m.submitted_by, 'RESULT_CONFIRMED', p_notice_title, p_notice_msg, 'match', p_match_id);
  end if;
  -- Staff audit for the staff paths (actor = caller; complies with 0034 rule).
  if p_audit_action is not null then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_data, reason)
      values (auth.uid(), p_audit_action, 'match', p_match_id, p_audit_new, p_audit_reason);
  end if;
  return round_complete;
end $$;
revoke all on function public.vik_finalize_match(uuid, text, int, int, uuid, uuid, text, jsonb, text, text, text) from public;
revoke all on function public.vik_finalize_match(uuid, text, int, int, uuid, uuid, text, jsonb, text, text, text) from anon;
revoke all on function public.vik_finalize_match(uuid, text, int, int, uuid, uuid, text, jsonb, text, text, text) from authenticated;

-- Opponent confirm: RESULT_SUBMITTED -> CONFIRMED with everything attached.
create or replace function public.confirm_match(p_match_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  m record;
  me uuid := auth.uid();
begin
  select * into m from public.matches where id = p_match_id for update;
  if m is null then raise exception 'Match not found.'; end if;
  if m.status != 'RESULT_SUBMITTED' then raise exception 'Nothing to confirm.'; end if;
  if m.forfeit_claimed_by is not null then
    raise exception 'Forfeit claim pending moderator review.';
  end if;
  if m.submitted_by is null or m.submitted_by = me then
    raise exception 'The submitter cannot confirm their own result — opponent must confirm.';
  end if;
  if me is distinct from m.player_a_id and me is distinct from m.player_b_id
    and not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only the opponent can confirm.';
  end if;
  if m.score_a is null or m.score_b is null then
    raise exception 'Match has no score.';
  end if;
  return public.vik_finalize_match(
    m.id, 'CONFIRMED', m.score_a, m.score_b, me, null,
    null, null, null,
    'Result confirmed',
    'Your ' || m.score_a || '–' || m.score_b || ' result was confirmed. Standings updated.');
end $$;
revoke all on function public.confirm_match(uuid) from public;
grant execute on function public.confirm_match(uuid) to authenticated;

-- Staff set-result (moderator review card, dispute resolution).
create or replace function public.admin_set_result(
  p_match_id uuid, p_score_a int, p_score_b int, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  m record;
begin
  if not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only staff can set results.';
  end if;
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    raise exception 'Scores must be whole numbers >= 0.';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if m is null then raise exception 'Match not found.'; end if;
  return public.vik_finalize_match(
    m.id, 'CONFIRMED', p_score_a, p_score_b, auth.uid(), null,
    'ADMIN_CHANGED_MATCH_RESULT',
    jsonb_build_object('scoreA', p_score_a, 'scoreB', p_score_b),
    coalesce(p_reason, 'dispute resolution'),
    'Result confirmed',
    'A moderator recorded your result ' || p_score_a || '–' || p_score_b || '. Standings updated.');
end $$;
revoke all on function public.admin_set_result(uuid, int, int, text) from public;
grant execute on function public.admin_set_result(uuid, int, int, text) to authenticated;

-- Staff forfeit (default 3–0 walkover to the winner).
create or replace function public.award_match_forfeit(
  p_match_id uuid, p_winner_id uuid, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  m record;
  loser uuid;
  sa int;
  sb int;
begin
  if not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only staff can award forfeits.';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if m is null then raise exception 'Match not found.'; end if;
  if p_winner_id is distinct from m.player_a_id and p_winner_id is distinct from m.player_b_id then
    raise exception 'Winner must be a participant.';
  end if;
  loser := case when p_winner_id = m.player_a_id then m.player_b_id else m.player_a_id end;
  sa := case when p_winner_id = m.player_a_id then 3 else 0 end;
  sb := case when p_winner_id = m.player_b_id then 3 else 0 end;
  return public.vik_finalize_match(
    m.id, 'FORFEIT', sa, sb, auth.uid(), loser,
    'ADMIN_AWARDED_FORFEIT',
    jsonb_build_object('winnerId', p_winner_id, 'loserId', loser),
    p_reason,
    'Result confirmed',
    'Forfeit recorded: ' || sa || '–' || sb || ' walkover. Standings updated.');
end $$;
revoke all on function public.award_match_forfeit(uuid, uuid, text) from public;
grant execute on function public.award_match_forfeit(uuid, uuid, text) to authenticated;
