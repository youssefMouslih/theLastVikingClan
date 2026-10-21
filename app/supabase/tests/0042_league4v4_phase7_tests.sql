-- VIK Clan Phase 7 tests: league deadline cron, reminders and forfeits.
-- Run AFTER 0042_league4v4_deadlines.sql.
--
-- PART A (automated): function shape, marker table, cron schedule, privileges
-- and realtime publication checks.
-- PART B (manual, needs real JWT accounts and a staging season): simulated
-- deadline transitions, notifications, forfeits and duplicate-run idempotency.
--
-- PART A only inspects the deployed catalog. PART B must not invent production
-- data; use a staging season whose fixtures are disposable.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
begin
  -- A1. league_run_deadlines() is a definer function with the guarded search
  -- path and covers open, reminder, reveal, forfeit, cancel and close paths.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_run_deadlines'
    and pg_get_function_result(p.oid) = 'jsonb'
    and pg_get_functiondef(p.oid) like '%clock_timestamp()%'
    and pg_get_functiondef(p.oid) like '%league_lock_season%'
    and pg_get_functiondef(p.oid) like '%league_lock_fixture%'
    and pg_get_functiondef(p.oid) like '%league_maybe_reveal_fixture%'
    and pg_get_functiondef(p.oid) like '%league_deadline_reminders%'
    and pg_get_functiondef(p.oid) like '%LEAGUE_MATCHDAY_OPEN%'
    and pg_get_functiondef(p.oid) like '%LEAGUE_LINEUP_REMINDER%'
    and pg_get_functiondef(p.oid) like '%LEAGUE_FIXTURE_FORFEITED%'
    and pg_get_functiondef(p.oid) like '%LEAGUE_FIXTURE_CANCELLED%'
    and pg_get_functiondef(p.oid) like '%LEAGUE_MATCHDAY_CLOSED%'
    and pg_get_functiondef(p.oid) like '%FIXTURE_FORFEITED%'
    and pg_get_functiondef(p.oid) like '%FIXTURE_CANCELLED%'
    and pg_get_functiondef(p.oid) like '%MATCHDAY_OPENED%'
    and pg_get_functiondef(p.oid) like '%MATCHDAY_CLOSED%'
    and pg_get_functiondef(p.oid) like '%status = ''FORFEITED''%'
    and pg_get_functiondef(p.oid) like '%status = ''CANCELLED''%'
    and p.prosecdef
    and p.proconfig::text like '%search_path=public, pg_temp%';
  if n < 1 then
    raise exception 'A1 FAIL: league_run_deadlines is missing a transition, notification or definer guard';
  end if;
  raise notice 'A1 ok: league_run_deadlines covers open/remind/reveal/forfeit/cancel/close';

  -- A2. Reminder markers are unique per matchday/team/kind so repeated cron runs
  -- cannot duplicate a notification. The table is internal-read only.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_deadline_reminders'::regclass
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) like '%(matchday_id, team_id, kind)%';
  if n < 1 then
    raise exception 'A2 FAIL: deadline reminders lack unique (matchday_id, team_id, kind)';
  end if;

  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_deadline_reminders'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%LINEUP_DUE%';
  if n < 1 then
    raise exception 'A2 FAIL: deadline reminders lack the LINEUP_DUE kind check';
  end if;

  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname = 'league_deadline_reminders'
    and c.relrowsecurity;
  if n < 1 then
    raise exception 'A2 FAIL: deadline reminders do not have RLS enabled';
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'league_deadline_reminders';
  if n <> 0 then
    raise exception 'A2 FAIL: deadline reminders should have no client policy (internal only)';
  end if;
  raise notice 'A2 ok: reminder markers are unique, validated and internal';

  -- A3. The cron job is registered exactly once with the league runner.
  select count(*) into n
  from cron.job
  where jobname = 'vik-league-deadlines'
    and schedule = '*/10 * * * *'
    and command like '%public.league_run_deadlines()%';
  if n <> 1 then
    raise exception 'A3 FAIL: vik-league-deadlines cron job is missing or duplicated (found %)', n;
  end if;
  raise notice 'A3 ok: vik-league-deadlines runs every 10 minutes';

  -- A4. Authenticated clients cannot invoke the runner or inspect markers.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_run_deadlines';
  if n < 1 then
    raise exception 'A4 FAIL: league_run_deadlines function is missing';
  end if;

  if has_function_privilege('authenticated', 'public.league_run_deadlines()', 'EXECUTE') then
    raise exception 'A4 FAIL: authenticated can execute league_run_deadlines';
  end if;
  if has_function_privilege('anon', 'public.league_run_deadlines()', 'EXECUTE') then
    raise exception 'A4 FAIL: anon can execute league_run_deadlines';
  end if;
  if has_table_privilege('authenticated', 'public.league_deadline_reminders', 'SELECT') then
    raise exception 'A4 FAIL: authenticated can select deadline reminders';
  end if;
  raise notice 'A4 ok: deadline runner and markers stay server-side';

  -- A5. The post-0040 realtime tables used by the league UI are published.
  select count(*) into n
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename in (
      'league_team_invites', 'league_byes', 'league_substitutions', 'league_tiebreak_orders'
    );
  if n < 4 then
    raise exception 'A5 FAIL: realtime publication is missing league tables (found %)', n;
  end if;
  raise notice 'A5 ok: league invites, byes, substitutions and tiebreaks are published';

  -- A6. Closing settles one missing lineup as a 4-0 forfeit and never guesses
  -- duel scores: no duel insert exists in the runner.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_run_deadlines'
    and pg_get_functiondef(p.oid) like '%home_duel_wins = case when%then 4 else 0 end%'
    and pg_get_functiondef(p.oid) like '%home_points = case when%then 3 else 0 end%'
    and pg_get_functiondef(p.oid) not like '%insert into public.league_duels%';
  if n < 1 then
    raise exception 'A6 FAIL: forfeit settlement is missing or the runner invents duel rows';
  end if;
  raise notice 'A6 ok: forfeits award 4-0/3-0 and the runner never inserts duels';
end;
$$;

-- ================= PART B: manual deadline simulation =================
-- Use a disposable ACTIVE season with approved squads and generated fixtures.
-- Run each statement in the Supabase SQL editor (postgres role) and record
-- actual vs expected in docs/4vs4-progress.txt.

-- B1. Open simulation
--    update league_matchdays set status='SCHEDULED',
--      opens_at = now() - interval '1 hour', deadline = now() + interval '1 day'
--      where season_id = '<season>';
--    select public.league_run_deadlines();
--    Expected: matchday OPEN, fixtures LINEUPS_PENDING, one
--    LEAGUE_MATCHDAY_OPEN notification per approved squad, MATCHDAY_OPENED audit.

-- B2. Duplicate open run
--    select public.league_run_deadlines();
--    Expected: opened_matchdays = 0; no new open notifications.

-- B3. 24h reminder
--    update league_matchdays set deadline = now() + interval '12 hours'
--      where season_id = '<season>';
--    select public.league_run_deadlines();
--    Expected: one LEAGUE_LINEUP_REMINDER per squad with no submitted lineup.
--    Run again: reminders = 0, no duplicate notifications.
--    Submit one lineup via league_submit_lineup, run again: that squad is skipped.

-- B4. One-lineup forfeit
--    update league_matchdays set deadline = now() - interval '1 hour'
--      where season_id = '<season>';
--    select public.league_run_deadlines();
--    Expected: fixtures with exactly one lineup become FORFEITED 4-0/0-4 with
--    3-0/0-3 points, completed_at set, present lineup LOCKED, both squads
--    notified with LEAGUE_FIXTURE_FORFEITED, FIXTURE_FORFEITED audit.

-- B5. Both-lineups reveal beats forfeit
--    Stage a fixture with two submitted lineups before the deadline.
--    Expected: league_maybe_reveal_fixture creates exactly four duels and the
--    runner does not forfeit or cancel it. Matchday becomes CLOSED until duels
--    finalize; unresolved duels stay with staff.

-- B6. Both-missing cancellation
--    Stage a fixture with no lineups.
--    Expected: FORFEIT does not apply; fixture becomes CANCELLED 0-0, both
--    squads notified with LEAGUE_FIXTURE_CANCELLED, FIXTURE_CANCELLED audit.

-- B7. Duplicate close run
--    select public.league_run_deadlines();
--    Expected: forfeited_fixtures = 0, cancelled_fixtures = 0,
--    closed_matchdays = 0; no duplicate notifications.

-- B8. Adversarial access
--    As an authenticated JWT, call league_run_deadlines and select
--    league_deadline_reminders: both must fail. Verify notification deep links:
--    league_matchday -> /4vs4/fixtures, league_fixture -> /4vs4/match/<id>,
--    league_duel -> /4vs4/duel/<id>, league_team -> /4vs4/teams/<id>.
