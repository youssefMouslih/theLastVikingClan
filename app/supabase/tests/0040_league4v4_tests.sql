-- VIK Clan 0040 tests: 4vs4 League schema foundation.
-- Run AFTER 0040_league4v4_schema.sql in the Supabase SQL editor.
--
-- PART A (automated): catalog assertions. Raises on failure.
-- PART B (manual, needs real JWT users): RLS/constraint checks for Phase 2+.
--
-- These tests intentionally do not create league data. Authoritative writes
-- arrive in 0041; Phase 1 proves the shape, guards, RLS, indexes and realtime
-- publication are present.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
  expected_tables text[] := array[
    'league_seasons','league_teams','league_team_members','league_team_invites',
    'league_matchdays','league_byes','league_fixtures','league_lineups',
    'league_lineup_players','league_duels','league_substitutions',
    'league_duel_reports','league_disputes','league_penalties',
    'league_tiebreak_orders','league_audit_logs'
  ];
begin
  -- A1. Every expected table exists with RLS enabled.
  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relname = any(expected_tables)
    and c.relkind = 'r'
    and c.relrowsecurity = true;
  if n < array_length(expected_tables, 1) then
    raise exception 'A1 FAIL: only % of % league tables exist with RLS enabled',
      n, array_length(expected_tables, 1);
  end if;
  raise notice 'A1 ok: % league tables exist and have RLS enabled', n;

  -- A2. SELECT-only client policies: no INSERT/UPDATE/DELETE/ALL policies.
  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename ~ '^league_'
    and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if n > 0 then
    raise exception 'A2 FAIL: % direct-write policies exist on league tables', n;
  end if;
  raise notice 'A2 ok: league tables are SELECT-only under RLS';

  -- A3. Each league table has exactly one SELECT policy.
  select count(*) into n
  from (
    select c.relname,
           count(p.policyname) filter (where p.cmd = 'SELECT') as select_policies,
           count(p.policyname) as all_policies
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    left join pg_policies p
      on p.schemaname = 'public' and p.tablename = c.relname
    where ns.nspname = 'public'
      and c.relname = any(expected_tables)
    group by c.relname
  ) x
  where select_policies = 1 and all_policies = 1;
  if n < array_length(expected_tables, 1) then
    raise exception 'A3 FAIL: only % of % league tables have exactly one SELECT policy',
      n, array_length(expected_tables, 1);
  end if;
  raise notice 'A3 ok: every league table has exactly one SELECT policy';

  -- A4. RLS visibility helpers exist, are SECURITY DEFINER, and are callable
  -- by authenticated users only.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'league_is_team_member','league_is_team_captain',
      'league_can_view_lineup','league_can_view_lineup_player',
      'league_can_view_duel_report'
    )
    and p.prosecdef = true
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute');
  if n < 5 then
    raise exception 'A4 FAIL: only % of 5 RLS helpers are definer/authenticated-only', n;
  end if;
  raise notice 'A4 ok: 5 RLS helpers are SECURITY DEFINER + authenticated-only';

  -- A5. Hidden-lineup helper checks the reveal state, not a client flag.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_can_view_lineup'
    and pg_get_functiondef(p.oid) like '%LINEUPS_REVEALED%'
    and pg_get_functiondef(p.oid) like '%league_is_team_member%';
  if n < 1 then
    raise exception 'A5 FAIL: lineup visibility helper lacks reveal/member gate';
  end if;
  raise notice 'A5 ok: lineup visibility is gated by fixture reveal + membership';

  -- A6. Partial unique indexes enforce the core invariants.
  select count(*) into n
  from pg_indexes
  where schemaname = 'public'
    and indexname in (
      'league_seasons_one_active_idx',
      'league_teams_name_ci_idx',
      'league_teams_one_captain_idx',
      'league_members_one_active_idx',
      'league_members_one_captain_idx',
      'league_invites_one_pending_idx',
      'league_disputes_one_open_idx'
    );
  if n < 7 then
    raise exception 'A6 FAIL: only % of 7 partial/unique league indexes present', n;
  end if;
  raise notice 'A6 ok: one-season/one-squad/one-captain/one-invite indexes present';

  -- A7. Score and final-result constraints exist.
  select count(*) into n
  from pg_constraint
  where conname in (
    'league_fixtures_final_total_check',
    'league_fixtures_final_points_check',
    'league_duels_confirmed_check',
    'league_duels_forfeit_winner_check',
    'league_reports_decisive_check',
    'league_substitutions_player_check',
    'league_members_left_check',
    'league_invites_self_check',
    'league_seasons_roster_check',
    'league_teams_name_check'
  );
  if n < 10 then
    raise exception 'A7 FAIL: only % of 10 expected league constraints present', n;
  end if;
  raise notice 'A7 ok: decisive-result, points, roster and identity constraints present';

  -- A8. Guard triggers are installed.
  select count(*) into n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and t.tgname in (
      'league_teams_guard','league_members_guard','league_invites_guard',
      'league_fixtures_guard','league_lineups_guard','league_lineup_players_guard',
      'league_duels_guard','league_substitutions_guard','league_reports_guard',
      'league_disputes_guard',
      'league_seasons_touch','league_teams_touch','league_members_touch',
      'league_matchdays_touch','league_fixtures_touch','league_lineups_touch',
      'league_duels_touch','league_reports_touch','league_disputes_touch'
    )
    and not t.tgisinternal;
  if n < 19 then
    raise exception 'A8 FAIL: only % of 19 league triggers present', n;
  end if;
  raise notice 'A8 ok: 19 league guard/timestamp triggers installed';

  -- A9. Realtime publication includes the live league tables.
  select count(*) into n
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename in (
      'league_seasons','league_teams','league_team_members',
      'league_matchdays','league_fixtures','league_lineups','league_duels',
      'league_duel_reports','league_disputes','league_penalties'
    );
  if n < 10 then
    raise exception 'A9 FAIL: only % of 10 league tables in supabase_realtime', n;
  end if;
  raise notice 'A9 ok: 10 league tables are in the realtime publication';

  -- A10. Critical lookup indexes exist for scale.
  select count(*) into n
  from pg_indexes
  where schemaname = 'public'
    and indexname in (
      'league_members_player_idx','league_invites_player_idx',
      'league_fixtures_season_idx','league_fixtures_teams_idx',
      'league_lineups_fixture_idx','league_duels_fixture_idx',
      'league_duels_players_idx','league_reports_duel_idx',
      'league_disputes_status_idx','league_penalties_team_idx',
      'league_audit_season_idx'
    );
  if n < 11 then
    raise exception 'A10 FAIL: only % of 11 league lookup indexes present', n;
  end if;
  raise notice 'A10 ok: 11 league lookup indexes present';

  raise notice 'PART A COMPLETE: all automated 0040 assertions passed.';
end $$;

-- ================= PART B: manual checks (Phase 2 / after 0041) =================
-- B1. One active squad per player per season.
--   Create two PENDING teams in the same season, add the same ACTIVE player to
--   both memberships. EXPECT the second insert fails on
--   league_members_one_active_idx.
--
-- B2. Captain uniqueness.
--   Add a second ACTIVE CAPTAIN row to the same team. EXPECT
--   league_members_one_captain_idx violation.
--
-- B3. Roster size.
--   Add a ninth ACTIVE member. EXPECT the league_members_guard error.
--   Approve a team with only five ACTIVE members. EXPECT the
--   league_teams_guard error.
--
-- B4. Lineup shape.
--   Update a lineup to SUBMITTED with 3 starters. EXPECT the
--   league_guard_lineup error. Repeat with 1 sub and with 5 subs.
--
-- B5. Hidden lineup RLS (needs two real JWTs/users).
--   As player A on team A, select league_lineups/league_lineup_players for the
--   fixture. EXPECT only team A's rows. Before reveal, team B's rows are not
--   returned. After the fixture becomes LINEUPS_REVEALED, both are visible.
--   Staff see both at all times.
--
-- B6. Direct writes.
--   As an authenticated player, INSERT/UPDATE/DELETE any league_* table via
--   REST. EXPECT RLS denial. Only 0041 RPCs may write.
--
-- B7. Result integrity.
--   Update a duel to CONFIRMED with equal scores. EXPECT
--   league_duels_confirmed_check. Update a fixture to COMPLETED with 3-0 duel
--   wins or wrong points. EXPECT the fixture guard/check.
--
-- B8. Substitution lock.
--   Set a duel started_at, then insert a substitution. EXPECT
--   "Substitutions are locked after the duel starts." Insert a report first
--   and retry. EXPECT "Substitutions are locked after a result is reported."
