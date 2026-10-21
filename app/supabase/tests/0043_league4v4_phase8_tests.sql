-- VIK Clan Phase 8 tests: 4vs4 hardening, RLS regression and deployment.
-- Run AFTER 0043_league4v4_hardening.sql.
--
-- PART A (automated): hardening indexes, RLS/write-policy inventory, definer
-- guards, anon/internal grants and realtime publication.
-- PART B (manual, needs real JWT accounts and a staging season): adversarial
-- hidden-lineup checks, direct-write denials, RPC authorization, existing
-- feature regression, i18n/RTL/accessibility and deployment readiness.
--
-- PART A only inspects the deployed catalog. PART B must not touch production;
-- use a disposable ACTIVE season with at least two approved squads.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
begin
  -- A1. Phase 8 deadline/schedule indexes exist.
  select count(*) into n
  from (values
    ('public.league_matchdays_status_opens_idx'),
    ('public.league_matchdays_status_deadline_idx'),
    ('public.league_fixtures_matchday_status_idx'),
    ('public.league_fixtures_season_status_idx'),
    ('public.league_byes_season_idx')
  ) v(name)
  where to_regclass(v.name) is not null;
  if n <> 5 then
    raise exception 'A1 FAIL: expected 5 Phase 8 indexes, found %', n;
  end if;
  raise notice 'A1 ok: Phase 8 hardening indexes present';

  -- A2. Every league table has RLS enabled.
  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind = 'r'
    and c.relname like 'league%'
    and not c.relrowsecurity;
  if n > 0 then
    raise exception 'A2 FAIL: % league table(s) without RLS', n;
  end if;
  raise notice 'A2 ok: RLS enabled on every public.league_* table';

  -- A3. Client policies are SELECT-only; all writes stay behind RPCs.
  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename like 'league%'
    and cmd <> 'SELECT';
  if n > 0 then
    raise exception 'A3 FAIL: % non-SELECT league policy/policies found', n;
  end if;
  raise notice 'A3 ok: no client INSERT/UPDATE/DELETE policies on league tables';

  -- A4. Deadline markers are readable by no client role (RLS, zero policies).
  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename = 'league_deadline_reminders';
  if n <> 0 then
    raise exception 'A4 FAIL: league_deadline_reminders must have no client policy';
  end if;
  raise notice 'A4 ok: deadline reminder markers are internal-only';

  -- A5. Every league definer function pins search_path to public, pg_temp.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname like 'league%'
    and p.prosecdef
    and not coalesce(p.proconfig::text like '%search_path=public, pg_temp%', false);
  if n > 0 then
    raise exception 'A5 FAIL: % league definer function(s) without guarded search_path', n;
  end if;
  raise notice 'A5 ok: all league definer functions pin search_path';

  -- A6. Anonymous cannot execute any league function.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname like 'league%'
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if n > 0 then
    raise exception 'A6 FAIL: anon can execute % league function(s)', n;
  end if;
  raise notice 'A6 ok: anon has no league function EXECUTE';

  -- A7. Internal helpers and the deadline runner stay closed to authenticated.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and (
      p.proname like 'league_guard%'
      or p.proname = 'league_touch_updated_at'
      or p.proname in (
        'league_run_deadlines',
        'league_finalize_fixture',
        'league_maybe_reveal_fixture',
        'league_audit',
        'league_notify_team'
      )
    )
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if n > 0 then
    raise exception 'A7 FAIL: authenticated can execute % internal league function(s)', n;
  end if;
  raise notice 'A7 ok: runner, trigger helpers and internal functions are not client-executable';

  -- A8. Every client-facing league table is published for realtime; RLS still
  -- filters each subscriber.
  select count(*) into n
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename in (
      'league_seasons',
      'league_teams',
      'league_team_members',
      'league_team_invites',
      'league_matchdays',
      'league_byes',
      'league_fixtures',
      'league_lineups',
      'league_duels',
      'league_substitutions',
      'league_duel_reports',
      'league_disputes',
      'league_penalties',
      'league_tiebreak_orders'
    );
  if n <> 14 then
    raise exception 'A8 FAIL: expected 14 published league tables, found %', n;
  end if;
  raise notice 'A8 ok: 14 league tables are in supabase_realtime';
end $$;

-- ================= PART B: manual adversarial + regression =================
-- B1. Hidden lineups (highest risk). With two real accounts on an open fixture:
--   a. Captain A submits a lineup; opponent B selects league_lineups and
--      league_lineup_players through PostgREST before reveal -> 0 rows.
--   b. Staff account and squad A members can read A's lineup; unrelated C
--      cannot read either squad's lineup.
--   c. Reveal the fixture, then B can read both lineups; C still cannot read
--      hidden rows for a different unrevealed fixture.
--   d. Repeat with direct REST calls using the anon key and no JWT -> 401/0.
--
-- B2. Direct writes. Using an authenticated JWT, attempt insert/update/delete
-- on each league table (seasons, teams, members, invites, matchdays, byes,
-- fixtures, lineups, lineup_players, duels, substitutions, duel_reports,
-- disputes, penalties, tiebreak_orders, deadline_reminders). Every attempt
-- must be denied; only the documented RPCs may mutate league data.
--
-- B3. RPC authorization. Verify deny paths with non-captain members and
-- unrelated users: create/update team, invite, answer/leave/remove, transfer
-- captain, submit lineup, start duel, substitute, submit/confirm report,
-- dispute/resolve, season/team/matchday admin, penalties, tiebreaks. Verify
-- authenticated cannot execute league_run_deadlines or read reminders.
--
-- B4. Evidence paths. Submit a report with a non-league/ path and verify it is
-- rejected; submit league/<season>/<fixture>/<file> and verify only both
-- squads + staff can read the private match-evidence object.
--
-- B5. Existing feature regression (two accounts, mobile viewport):
--   a. Auth/login/session refresh, profile edit, avatar upload.
--   b. Cups/battles: create, join, result/dispute and standings still work.
--   c. War Council squads (3v3/4v4) unchanged: open, edit, save.
--   d. Notifications: read/unread, deep links, push/offline banner.
--   e. Admin: setup health, access/tryout tabs, announcements, badges.
--   f. PWA: install prompt, offline navigation, update banner.
--
-- B6. i18n/RTL/accessibility/mobile:
--   a. Visit hub, teams, team detail, fixtures, match, standings, stats,
--      admin, staff disputes and notifications in EN/FR/AR; no missing keys,
--      raw enum labels or layout overflow.
--   b. Arabic sets dir="rtl"; tables/cards/buttons mirror correctly.
--   c. Keyboard focus reaches every action; CTA labels are explicit; color is
--      never the only state signal; tap targets >= 44px on 360px width.
--   d. Countdown/action card does not leak hidden lineup names before reveal.
--
-- B7. Performance sanity: run EXPLAIN (ANALYZE) for the cron matchday/fixture
-- scans and schedule/standings queries on staged data; confirm the Phase 8
-- indexes are used and no new sequential scans appear on hot paths.
--
-- B8. Deployment readiness (separate explicit approval required):
--   a. Back up the production database and record the current migration level.
--   b. Apply 0040 -> 0043 in order (existing DB) or FULL_SETUP once (fresh);
--      enable pg_cron if CREATE EXTENSION is blocked.
--   c. Confirm cron.job has vik-league-deadlines at */10 * * * * and run
--      select public.league_run_deadlines() manually on staging; expect a
--      JSON summary and zero duplicate transitions on a second run.
--   d. Confirm realtime publication, private buckets and edge functions.
--   e. Run Part A on production, then the two-account smoke in B1-B4 on
--      staging; record evidence here and in docs/4vs4-progress.txt.
--   f. Deploy the frontend only after the database checks pass and the user
--      approves the production diff.
