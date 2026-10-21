-- VIK Clan migration 0042: 4vs4 League deadlines, reminders and automation.
-- Run AFTER 0041. Idempotent: IF NOT EXISTS / OR REPLACE / unschedule-guarded.
--
-- league_run_deadlines() runs every 10 minutes (pg_cron) and, idempotently:
--  1. opens SCHEDULED matchdays whose opens_at has passed;
--  2. sends one 24h lineup reminder per squad/matchday that has not submitted;
--  3. closes matchdays whose deadline has passed, revealing complete lineups;
--  4. awards a 4-0 forfeit when exactly one squad missed the lineup deadline;
--  5. cancels a fixture when both squads missed the lineup deadline;
--  6. completes a matchday when every fixture is already final.
-- It never guesses a disputed or unreported duel score. Deadline state changes
-- and notification side effects are conditional on status transitions, so
-- duplicate cron runs are no-ops.
-- Needs: pg_cron extension (Supabase: enable under Database > Extensions if
-- CREATE EXTENSION is blocked).

create extension if not exists pg_cron;

-- ============================================================================
-- 1. Deadline reminder markers
-- ============================================================================

create table if not exists public.league_deadline_reminders (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  matchday_id uuid not null,
  team_id uuid not null,
  kind text not null check (kind in ('LINEUP_DUE')),
  sent_at timestamptz not null default now(),
  unique (matchday_id, team_id, kind),
  foreign key (matchday_id, season_id)
    references public.league_matchdays(id, season_id) on delete cascade,
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create index if not exists league_deadline_reminders_matchday_idx
  on public.league_deadline_reminders (matchday_id, team_id);

alter table public.league_deadline_reminders enable row level security;
revoke all on table public.league_deadline_reminders from public, anon, authenticated;

-- ============================================================================
-- 2. Deadline runner
-- ============================================================================

create or replace function public.league_run_deadlines()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_opened int := 0;
  v_reminded int := 0;
  v_revealed int := 0;
  v_forfeited int := 0;
  v_cancelled int := 0;
  v_closed int := 0;
  v_skipped int := 0;
  v_candidate record;
  v_md public.league_matchdays%rowtype;
  v_fixture_row record;
  v_fixture public.league_fixtures%rowtype;
  v_team record;
  v_home_has boolean;
  v_away_has boolean;
  v_winner uuid;
  v_loser uuid;
  v_note text;
  v_new_status text;
  v_reminder_id uuid;
begin
  -- --------------------------------------------------------------------------
  -- 2a. Open due matchdays and flip their fixtures to LINEUPS_PENDING.
  -- Lock season before matchday to match league_lock_matchday()'s lock order.
  -- --------------------------------------------------------------------------
  for v_candidate in
    select m.id, m.season_id
    from public.league_matchdays m
    join public.league_seasons s on s.id = m.season_id
    where s.status = 'ACTIVE'
      and m.status = 'SCHEDULED'
      and m.opens_at <= v_now
      and m.deadline > v_now
    order by m.opens_at, m.number
  loop
    perform public.league_lock_season(v_candidate.season_id);

    select * into v_md
    from public.league_matchdays m
    where m.id = v_candidate.id
    for update;

    if v_md.id is null then
      continue;
    end if;

    -- Re-check after waiting for the lock: another run may have opened it or
    -- an admin may have extended/moved the window.
    if v_md.status <> 'SCHEDULED'
       or v_md.opens_at > v_now
       or v_md.deadline <= v_now
       or not exists (
         select 1 from public.league_seasons s
         where s.id = v_md.season_id and s.status = 'ACTIVE'
       ) then
      continue;
    end if;

    update public.league_matchdays
      set status = 'OPEN'
    where id = v_md.id
      and status = 'SCHEDULED';

    update public.league_fixtures
      set status = 'LINEUPS_PENDING'
    where matchday_id = v_md.id
      and status = 'SCHEDULED';

    for v_team in
      select distinct x.team_id
      from (
        select f.home_team_id as team_id
        from public.league_fixtures f
        join public.league_teams t on t.id = f.home_team_id and t.status = 'APPROVED'
        where f.matchday_id = v_md.id
        union
        select f.away_team_id
        from public.league_fixtures f
        join public.league_teams t on t.id = f.away_team_id and t.status = 'APPROVED'
        where f.matchday_id = v_md.id
      ) x
    loop
      perform public.league_notify_team(
        v_team.team_id,
        'LEAGUE_MATCHDAY_OPEN',
        'League matchday open',
        'Matchday ' || v_md.number || ' is open. Submit your lineup before '
          || to_char(v_md.deadline at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC.',
        'league_matchday', v_md.id);
    end loop;

    perform public.league_audit(
      v_md.season_id, 'MATCHDAY_OPENED', 'league_matchday', v_md.id,
      jsonb_build_object('status', v_md.status),
      jsonb_build_object('status', 'OPEN'),
      null);

    v_opened := v_opened + 1;
  end loop;

  -- --------------------------------------------------------------------------
  -- 2b. One reminder per squad/matchday inside the final 24 hours. The unique
  -- marker is inserted before notifying, so repeat runs and an extended
  -- deadline cannot duplicate the same reminder.
  -- --------------------------------------------------------------------------
  for v_md in
    select m.*
    from public.league_matchdays m
    join public.league_seasons s on s.id = m.season_id
    where s.status = 'ACTIVE'
      and m.status = 'OPEN'
      and m.deadline > v_now
      and m.deadline <= v_now + interval '24 hours'
    order by m.deadline, m.number
  loop
    for v_team in
      select distinct x.team_id, x.fixture_id
      from (
        select f.home_team_id as team_id, f.id as fixture_id
        from public.league_fixtures f
        join public.league_teams t on t.id = f.home_team_id and t.status = 'APPROVED'
        where f.matchday_id = v_md.id
          and f.status in ('SCHEDULED','LINEUPS_PENDING')
        union
        select f.away_team_id, f.id
        from public.league_fixtures f
        join public.league_teams t on t.id = f.away_team_id and t.status = 'APPROVED'
        where f.matchday_id = v_md.id
          and f.status in ('SCHEDULED','LINEUPS_PENDING')
      ) x
    loop
      if exists (
        select 1
        from public.league_lineups l
        join public.league_fixtures f on f.id = l.fixture_id
        where f.matchday_id = v_md.id
          and l.team_id = v_team.team_id
          and l.status in ('SUBMITTED','REVEALED','LOCKED')
      ) then
        continue;
      end if;

      v_reminder_id := null;
      insert into public.league_deadline_reminders
        (season_id, matchday_id, team_id, kind)
      values
        (v_md.season_id, v_md.id, v_team.team_id, 'LINEUP_DUE')
      on conflict (matchday_id, team_id, kind) do nothing
      returning id into v_reminder_id;

      if v_reminder_id is not null then
        perform public.league_notify_team(
          v_team.team_id,
          'LEAGUE_LINEUP_REMINDER',
          'League lineup due soon',
          'Matchday ' || v_md.number || ' closes '
            || to_char(v_md.deadline at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC. '
            || 'Submit your lineup before the deadline to avoid a forfeit.',
          'league_fixture', v_team.fixture_id);
        v_reminded := v_reminded + 1;
      end if;
    end loop;
  end loop;

  -- --------------------------------------------------------------------------
  -- 2c. Close expired matchdays. Reveal complete fixtures first; then settle
  -- fixtures that still have no lineup from one or both squads.
  -- --------------------------------------------------------------------------
  for v_candidate in
    select m.id, m.season_id
    from public.league_matchdays m
    join public.league_seasons s on s.id = m.season_id
    where s.status = 'ACTIVE'
      and m.status in ('SCHEDULED','OPEN')
      and m.deadline <= v_now
    order by m.deadline, m.number
  loop
    perform public.league_lock_season(v_candidate.season_id);

    select * into v_md
    from public.league_matchdays m
    where m.id = v_candidate.id
    for update;

    if v_md.id is null then
      continue;
    end if;

    if v_md.status not in ('SCHEDULED','OPEN')
       or v_md.deadline > v_now
       or not exists (
         select 1 from public.league_seasons s
         where s.id = v_md.season_id and s.status = 'ACTIVE'
       ) then
      continue;
    end if;

    for v_fixture_row in
      select f.id
      from public.league_fixtures f
      where f.matchday_id = v_md.id
        and f.status in ('SCHEDULED','LINEUPS_PENDING')
      order by f.created_at, f.id
    loop
      v_fixture := public.league_lock_fixture(v_fixture_row.id);

      if v_fixture.status not in ('SCHEDULED','LINEUPS_PENDING') then
        continue;
      end if;

      if public.league_maybe_reveal_fixture(v_fixture.id) then
        v_revealed := v_revealed + 1;
        continue;
      end if;

      select
        exists (
          select 1
          from public.league_lineups l
          where l.fixture_id = v_fixture.id
            and l.team_id = v_fixture.home_team_id
            and l.status in ('SUBMITTED','REVEALED','LOCKED')
        ),
        exists (
          select 1
          from public.league_lineups l
          where l.fixture_id = v_fixture.id
            and l.team_id = v_fixture.away_team_id
            and l.status in ('SUBMITTED','REVEALED','LOCKED')
        )
        into v_home_has, v_away_has;

      if v_home_has and v_away_has then
        -- Both lineups exist but reveal did not complete (defensive): leave the
        -- fixture for staff rather than inventing a result.
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if v_home_has or v_away_has then
        v_winner := case when v_home_has then v_fixture.home_team_id else v_fixture.away_team_id end;
        v_loser := case when v_home_has then v_fixture.away_team_id else v_fixture.home_team_id end;
        if v_home_has then
          v_note := 'Automatic forfeit: the away squad did not submit a lineup by the deadline.';
        else
          v_note := 'Automatic forfeit: the home squad did not submit a lineup by the deadline.';
        end if;

        update public.league_fixtures
          set status = 'FORFEITED',
              home_duel_wins = case when v_winner = v_fixture.home_team_id then 4 else 0 end,
              away_duel_wins = case when v_winner = v_fixture.away_team_id then 4 else 0 end,
              home_points = case when v_winner = v_fixture.home_team_id then 3 else 0 end,
              away_points = case when v_winner = v_fixture.away_team_id then 3 else 0 end,
              completed_at = v_now,
              admin_note = v_note
        where id = v_fixture.id;

        update public.league_lineups
          set status = 'LOCKED'
        where fixture_id = v_fixture.id
          and status in ('DRAFT','SUBMITTED');

        perform public.league_notify_team(
          v_winner,
          'LEAGUE_FIXTURE_FORFEITED',
          'League fixture forfeit win',
          'Your squad was awarded a 4-0 forfeit win because the opponent missed the lineup deadline.',
          'league_fixture', v_fixture.id);
        perform public.league_notify_team(
          v_loser,
          'LEAGUE_FIXTURE_FORFEITED',
          'League fixture forfeited',
          'Your squad forfeited 0-4 because no lineup was submitted before the deadline.',
          'league_fixture', v_fixture.id);

        perform public.league_audit(
          v_md.season_id, 'FIXTURE_FORFEITED', 'league_fixture', v_fixture.id,
          jsonb_build_object('status', v_fixture.status),
          jsonb_build_object(
            'status', 'FORFEITED',
            'winner_team_id', v_winner,
            'home_duel_wins', case when v_winner = v_fixture.home_team_id then 4 else 0 end,
            'away_duel_wins', case when v_winner = v_fixture.away_team_id then 4 else 0 end),
          v_note);

        v_forfeited := v_forfeited + 1;
      else
        update public.league_fixtures
          set status = 'CANCELLED',
              home_duel_wins = 0,
              away_duel_wins = 0,
              home_points = 0,
              away_points = 0,
              completed_at = v_now,
              admin_note = 'Automatic cancellation: both squads missed the lineup deadline.'
        where id = v_fixture.id;

        update public.league_lineups
          set status = 'LOCKED'
        where fixture_id = v_fixture.id
          and status in ('DRAFT','SUBMITTED');

        perform public.league_notify_team(
          v_fixture.home_team_id,
          'LEAGUE_FIXTURE_CANCELLED',
          'League fixture cancelled',
          'The fixture was cancelled because neither squad submitted a lineup before the deadline.',
          'league_fixture', v_fixture.id);
        perform public.league_notify_team(
          v_fixture.away_team_id,
          'LEAGUE_FIXTURE_CANCELLED',
          'League fixture cancelled',
          'The fixture was cancelled because neither squad submitted a lineup before the deadline.',
          'league_fixture', v_fixture.id);

        perform public.league_audit(
          v_md.season_id, 'FIXTURE_CANCELLED', 'league_fixture', v_fixture.id,
          jsonb_build_object('status', v_fixture.status),
          jsonb_build_object('status', 'CANCELLED', 'reason', 'both_lineups_missing'),
          'Automatic cancellation: both squads missed the lineup deadline.');

        v_cancelled := v_cancelled + 1;
      end if;
    end loop;

    update public.league_matchdays m
      set status = case
        when exists (
          select 1 from public.league_fixtures f
          where f.matchday_id = m.id
            and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
        ) then 'CLOSED'
        else 'COMPLETED'
      end
    where m.id = v_md.id
    returning m.status into v_new_status;

    for v_team in
      select distinct x.team_id
      from (
        select f.home_team_id as team_id
        from public.league_fixtures f
        join public.league_teams t on t.id = f.home_team_id and t.status = 'APPROVED'
        where f.matchday_id = v_md.id
        union
        select f.away_team_id
        from public.league_fixtures f
        join public.league_teams t on t.id = f.away_team_id and t.status = 'APPROVED'
        where f.matchday_id = v_md.id
      ) x
    loop
      perform public.league_notify_team(
        v_team.team_id,
        'LEAGUE_MATCHDAY_CLOSED',
        'League matchday closed',
        'Matchday ' || v_md.number || ' is ' || lower(v_new_status)
          || '. Missing lineups were settled automatically; open disputes remain with staff.',
        'league_matchday', v_md.id);
    end loop;

    perform public.league_audit(
      v_md.season_id, 'MATCHDAY_CLOSED', 'league_matchday', v_md.id,
      jsonb_build_object('status', v_md.status),
      jsonb_build_object('status', v_new_status),
      null);

    v_closed := v_closed + 1;
  end loop;

  return jsonb_build_object(
    'opened_matchdays', v_opened,
    'reminders', v_reminded,
    'revealed_fixtures', v_revealed,
    'forfeited_fixtures', v_forfeited,
    'cancelled_fixtures', v_cancelled,
    'closed_matchdays', v_closed,
    'skipped_fixtures', v_skipped);
end;
$$;

revoke all on function public.league_run_deadlines() from public, anon, authenticated;

-- ============================================================================
-- 3. Realtime tables added after 0040
-- ============================================================================

do $$ begin alter publication supabase_realtime add table public.league_team_invites; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_byes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_substitutions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_tiebreak_orders; exception when duplicate_object then null; end $$;

-- ============================================================================
-- 4. Every-10-minutes schedule (idempotent re-register)
-- ============================================================================

do $$ begin
  perform cron.unschedule('vik-league-deadlines');
exception when others then null; end $$;
select cron.schedule(
  'vik-league-deadlines',
  '*/10 * * * *',
  'select public.league_run_deadlines();'
);
