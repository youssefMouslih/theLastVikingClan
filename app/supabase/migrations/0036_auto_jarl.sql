-- VIK Clan migration 0036: Auto-Jarl (pg_cron background automation).
-- Run AFTER 0035. Idempotent: IF NOT EXISTS / OR REPLACE / unschedule-guarded.
--
-- run_auto_jarl() runs every 15 min (pg_cron) and, idempotently:
--  1. flips expired SCHEDULED/RESULT_SUBMITTED matches to OVERDUE + MATCH_OVERDUE to both;
--  2. sends MATCH_DEADLINE_WARNING at 24h and 3h (match_reminders markers, once each);
--  3. auto-CONFIRMs silent RESULT_SUBMITTED (older than auto_confirm_hours, evidence
--     present, no claim, no open dispute) via vik_finalize_match + AUTO_CONFIRMED audit;
--  4. in forfeit_mode='auto' only, settles OVERDUE past overdue_grace_hours via
--     vik_finalize_match (one side active -> FORFEIT 3-0, none active -> CANCELLED);
--  5. FINISHes competitions past end_date with all matches final;
--  6. rotates waitlist offers (OFFERED 24h -> EXPIRED -> next WAITING).
-- All state changes reuse vik_finalize_match (0035), so XP/rounds/achievements update.
-- Needs: pg_cron extension + schedule below (Supabase: also enable in
-- Dashboard > Database > Extensions if CREATE EXTENSION is blocked).

create extension if not exists pg_cron;

-- ============ settings columns (Admin > Access toggles) ============
alter table public.clan_settings
  add column if not exists auto_jarl_enabled boolean not null default true,
  add column if not exists auto_confirm_hours int not null default 48,
  add column if not exists overdue_grace_hours int not null default 48,
  add column if not exists forfeit_mode text not null default 'manual';
do $$ begin
  alter table public.clan_settings add check (auto_confirm_hours >= 1);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clan_settings add check (overdue_grace_hours >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clan_settings add check (forfeit_mode in ('auto','manual'));
exception when duplicate_object then null; end $$;

-- ============ reminder markers (server-only table, no client policies) ============
create table if not exists public.match_reminders (
  match_id uuid primary key references public.matches(id) on delete cascade,
  warned_24h_at timestamptz,
  warned_3h_at timestamptz
);
alter table public.match_reminders enable row level security;

-- ============ cron path through the 0034 match guard ============
-- Re-states guard_match_update with one addition: auth.uid() IS NULL means
-- server-side background work (pg_cron / definer RPCs) — no JWT exists there.
-- API callers always carry a JWT and anon is excluded by policy, so this
-- branch is unreachable through the public anon key.
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
  if me is null then
    return NEW;
  end if;
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

-- ============ the Auto-Jarl run ============
create or replace function public.run_auto_jarl()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s record;
  m record;
  rem record;
  c record;
  w record;
  opp uuid;
  opp_name text;
  has_ev boolean;
  has_disp boolean;
  active uuid;
  loser uuid;
  parts int;
  open_n int;
  offered uuid;
  n_overdue int := 0;
  n_warn int := 0;
  n_autoconf int := 0;
  n_forfeit int := 0;
  n_cancelled int := 0;
  n_finished int := 0;
  n_offers int := 0;
begin
  select * into s from public.clan_settings limit 1;
  if s is null or coalesce(s.auto_jarl_enabled, true) = false then
    return jsonb_build_object('enabled', false);
  end if;

  -- 1. overdue sweep + notify both (the status flip is the sent-once gate).
  for m in select id, player_a_id, player_b_id from public.matches
      where status in ('SCHEDULED','RESULT_SUBMITTED') and deadline < now() loop
    update public.matches set status = 'OVERDUE', updated_at = now() where id = m.id;
    for opp in select unnest(array[m.player_a_id, m.player_b_id]) loop
      select coalesce(p.display_name, p.username, '?') into opp_name from public.profiles p
        where p.id = (case when opp = m.player_a_id then m.player_b_id else m.player_a_id end);
      insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
        values (opp, 'MATCH_OVERDUE', 'Match overdue',
          'Your match vs ' || opp_name || ' passed its deadline — play it or contact a moderator.',
          'match', m.id);
    end loop;
    n_overdue := n_overdue + 1;
  end loop;

  -- 2. deadline warnings at 24h and 3h, each sent once per match.
  for m in select id, deadline, player_a_id, player_b_id from public.matches
      where status in ('SCHEDULED','RESULT_SUBMITTED')
        and deadline > now() and deadline <= now() + interval '24 hours' loop
    insert into public.match_reminders (match_id) values (m.id)
      on conflict (match_id) do nothing;
    select * into rem from public.match_reminders where match_id = m.id;
    if rem.warned_24h_at is null then
      for opp in select unnest(array[m.player_a_id, m.player_b_id]) loop
        select coalesce(p.display_name, p.username, '?') into opp_name from public.profiles p
          where p.id = (case when opp = m.player_a_id then m.player_b_id else m.player_a_id end);
        insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
          values (opp, 'MATCH_DEADLINE_WARNING', 'Deadline in 24 hours',
            'Your match vs ' || opp_name || ' is due within 24 hours.',
            'match', m.id);
      end loop;
      update public.match_reminders set warned_24h_at = now() where match_id = m.id;
      n_warn := n_warn + 1;
    end if;
    if m.deadline <= now() + interval '3 hours' and rem.warned_3h_at is null then
      for opp in select unnest(array[m.player_a_id, m.player_b_id]) loop
        select coalesce(p.display_name, p.username, '?') into opp_name from public.profiles p
          where p.id = (case when opp = m.player_a_id then m.player_b_id else m.player_a_id end);
        insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
          values (opp, 'MATCH_DEADLINE_WARNING', 'Deadline in 3 hours',
            'Your match vs ' || opp_name || ' is due within 3 hours — play now.',
            'match', m.id);
      end loop;
      update public.match_reminders set warned_3h_at = now() where match_id = m.id;
      n_warn := n_warn + 1;
    end if;
  end loop;

  -- 3. auto-confirm silent submitted results (evidence, no claim, no open dispute).
  for m in select id, score_a, score_b, player_a_id, player_b_id, submitted_by
      from public.matches
      where status in ('RESULT_SUBMITTED','OVERDUE')
        and submitted_by is not null
        and score_a is not null and score_b is not null
        and submitted_at is not null
        and submitted_at < now() - make_interval(hours => s.auto_confirm_hours)
        and forfeit_claimed_by is null loop
    select exists(select 1 from public.match_evidence where match_id = m.id) into has_ev;
    if not has_ev then continue; end if;
    select exists(select 1 from public.disputes
      where match_id = m.id and status in ('OPEN','UNDER_REVIEW')) into has_disp;
    if has_disp then continue; end if;
    perform public.vik_finalize_match(
      m.id, 'CONFIRMED', m.score_a, m.score_b, null, null,
      'AUTO_CONFIRMED',
      jsonb_build_object('auto', true, 'silentHours', s.auto_confirm_hours),
      'Silent result with evidence auto-confirmed.',
      'Result confirmed',
      'Your ' || m.score_a || '–' || m.score_b || ' result was confirmed. Standings updated.');
    opp := case when m.submitted_by = m.player_a_id then m.player_b_id else m.player_a_id end;
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
      values (opp, 'RESULT_CONFIRMED', 'Result confirmed',
        'Your opponent went silent — the submitted ' || m.score_a || '–' || m.score_b
        || ' stands after ' || s.auto_confirm_hours || 'h.',
        'match', m.id);
    n_autoconf := n_autoconf + 1;
  end loop;

  -- 4. forfeit rule (auto mode only) past the grace period.
  if s.forfeit_mode = 'auto' then
    for m in select id, player_a_id, player_b_id, submitted_by, forfeit_claimed_by
        from public.matches
        where status = 'OVERDUE' and deadline < now() - make_interval(hours => s.overdue_grace_hours) loop
      if m.forfeit_claimed_by is not null then
        -- Claimant conceded: the other warrior takes it.
        active := case when m.forfeit_claimed_by = m.player_a_id then m.player_b_id else m.player_a_id end;
      elsif m.submitted_by is not null then
        -- One side played, the other never answered.
        active := m.submitted_by;
      else
        -- Both silent: cancel, no Glory either way.
        update public.matches set status = 'CANCELLED', updated_at = now() where id = m.id;
        for opp in select unnest(array[m.player_a_id, m.player_b_id]) loop
          insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
            values (opp, 'MATCH_OVERDUE', 'Match cancelled',
              'Neither warrior answered — the tie is cancelled. No Glory awarded.',
              'match', m.id);
        end loop;
        n_cancelled := n_cancelled + 1;
        continue;
      end if;
      loser := case when active = m.player_a_id then m.player_b_id else m.player_a_id end;
      perform public.vik_finalize_match(
        m.id, 'FORFEIT',
        case when active = m.player_a_id then 3 else 0 end,
        case when active = m.player_b_id then 3 else 0 end,
        null, loser,
        'AUTO_FORFEIT',
        jsonb_build_object('auto', true, 'winnerId', active, 'loserId', loser),
        'Overdue grace expired, one side silent.',
        'Result confirmed',
        'Forfeit recorded: 3–0 walkover. Standings updated.');
      insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
        values (loser, 'MATCH_OVERDUE', 'Forfeit recorded',
          'You never answered — a 3–0 forfeit was recorded against you.',
          'match', m.id);
      n_forfeit := n_forfeit + 1;
    end loop;
  end if;

  -- 5. auto-finish competitions past end_date with everything final.
  for c in select id from public.competitions
      where status = 'ACTIVE' and is_deleted = false
        and end_date is not null and end_date < now() loop
    select count(*) into open_n from public.matches
      where competition_id = c.id and status not in ('CONFIRMED','FORFEIT','CANCELLED');
    if open_n = 0 then
      update public.competitions set status = 'FINISHED', updated_at = now() where id = c.id;
      n_finished := n_finished + 1;
    end if;
  end loop;

  -- 6a. waitlist hygiene: anyone who already joined stops waiting.
  update public.competition_waitlist w set status = 'ACCEPTED'
    where w.status in ('WAITING','OFFERED','EXPIRED')
      and exists (select 1 from public.competition_participants p
        where p.competition_id = w.competition_id and p.player_id = w.player_id);
  -- 6b. expire stale offers.
  update public.competition_waitlist set status = 'EXPIRED'
    where status = 'OFFERED' and expires_at is not null and expires_at < now();
  -- 6c. offer the head of the line where a slot is free and no live offer.
  for c in select id, max_players, registration_deadline from public.competitions
      where status = 'REGISTRATION_OPEN' and is_deleted = false
        and (registration_deadline is null or registration_deadline > now()) loop
    select count(*) into parts from public.competition_participants
      where competition_id = c.id;
    if parts >= c.max_players then continue; end if;
    select id into offered from public.competition_waitlist
      where competition_id = c.id and status = 'OFFERED' limit 1;
    if offered is not null then continue; end if;
    select q.id, q.player_id into w from public.competition_waitlist q
      where q.competition_id = c.id and q.status = 'WAITING'
        and not exists (select 1 from public.competition_participants p
          where p.competition_id = c.id and p.player_id = q.player_id)
      order by q.position asc limit 1;
    if w.id is null then continue; end if;
    update public.competition_waitlist
      set status = 'OFFERED', expires_at = now() + interval '24 hours'
      where id = w.id;
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
      values (w.player_id, 'WAITLIST_AVAILABLE', 'A slot opened',
        'A competition slot opened for you — join within 24 hours.',
        'competition', c.id);
    n_offers := n_offers + 1;
  end loop;

  return jsonb_build_object(
    'enabled', true, 'overdue', n_overdue, 'warnings', n_warn,
    'autoConfirmed', n_autoconf, 'forfeits', n_forfeit, 'cancelled', n_cancelled,
    'finished', n_finished, 'offers', n_offers);
end $$;
revoke all on function public.run_auto_jarl() from public;

-- ============ every-15-minutes schedule (idempotent re-register) ============
do $$ begin
  perform cron.unschedule('vik-auto-jarl');
exception when others then null; end $$;
select cron.schedule('vik-auto-jarl', '*/15 * * * *', 'select public.run_auto_jarl();');
