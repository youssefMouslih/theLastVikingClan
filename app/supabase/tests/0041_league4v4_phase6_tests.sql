-- VIK Clan Phase 6 tests: standings, penalties, tiebreak order, statistics.
-- Run AFTER 0040_league4v4_schema.sql and 0041_league4v4_functions.sql.
--
-- PART A (automated): function-shape, policy, grant and constraint checks.
-- PART B (manual, needs real JWT accounts and played fixtures): hand-computed
-- standings, penalties, head-to-head, admin tiebreak and statistics checks.
--
-- PART A only inspects the deployed catalog. PART B must not invent production
-- data; use a staging season whose fixtures are already final.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
begin
  -- A1. Standings expose the UI contract and combine fixture points,
  -- penalties, head-to-head points and admin tiebreak order. Positions are
  -- assigned by row_number over the documented criteria.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_standings'
    and pg_get_function_result(p.oid) like '%standing_position%'
    and pg_get_function_result(p.oid) like '%team_id%'
    and pg_get_function_result(p.oid) like '%team_name%'
    and pg_get_function_result(p.oid) like '%played%'
    and pg_get_function_result(p.oid) like '%wins%'
    and pg_get_function_result(p.oid) like '%draws%'
    and pg_get_function_result(p.oid) like '%losses%'
    and pg_get_function_result(p.oid) like '%duels_won%'
    and pg_get_function_result(p.oid) like '%duels_lost%'
    and pg_get_function_result(p.oid) like '%duel_diff%'
    and pg_get_function_result(p.oid) like '%fixture_points%'
    and pg_get_function_result(p.oid) like '%penalty_points%'
    and pg_get_function_result(p.oid) like '%points%'
    and pg_get_functiondef(p.oid) like '%public.league_penalties%'
    and pg_get_functiondef(p.oid) like '%public.league_tiebreak_orders%'
    and pg_get_functiondef(p.oid) like '%b_h2h_points%'
    and pg_get_functiondef(p.oid) like '%row_number() over%'
    and p.prosecdef
    and p.proconfig::text like '%search_path=public, pg_temp%';
  if n < 1 then
    raise exception 'A1 FAIL: league_standings is missing a column, tiebreak source or definer guard';
  end if;
  raise notice 'A1 ok: standings combine fixture points, penalties, h2h and admin order';

  -- A2. Penalty RPC is admin-only, blocks archived seasons, validates points,
  -- reason, squad membership and matchday membership, then inserts, notifies
  -- the squad and writes an audit row.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_apply_penalty'
    and pg_get_functiondef(p.oid) like '%league_require_admin%'
    and pg_get_functiondef(p.oid) like '%Archived seasons cannot be penalized.%'
    and pg_get_functiondef(p.oid) like '%Penalty points must be a non-zero value between -100 and 100.%'
    and pg_get_functiondef(p.oid) like '%char_length(btrim(p_reason)) not between 3 and 1000%'
    and pg_get_functiondef(p.oid) like '%Squad is not part of this season.%'
    and pg_get_functiondef(p.oid) like '%Matchday is not part of this season.%'
    and pg_get_functiondef(p.oid) like '%insert into public.league_penalties%'
    and pg_get_functiondef(p.oid) like '%LEAGUE_SANCTION%'
    and pg_get_functiondef(p.oid) like '%PENALTY_APPLIED%';
  if n < 1 then
    raise exception 'A2 FAIL: league_apply_penalty is missing validation, notification or audit';
  end if;

  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_penalties'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%points%'
    and pg_get_constraintdef(c.oid) like '%100%'
    and pg_get_constraintdef(c.oid) like '%-100%';
  if n < 1 then
    raise exception 'A2 FAIL: league_penalties has no -100..100 points check';
  end if;

  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_penalties'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%char_length%'
    and pg_get_constraintdef(c.oid) like '%1000%';
  if n < 1 then
    raise exception 'A2 FAIL: league_penalties has no reason length check';
  end if;
  raise notice 'A2 ok: penalties are staff-only, validated, notified and audited';

  -- A3. Tiebreak RPC is admin-only, limited to ACTIVE/COMPLETED seasons, and
  -- replaces the full approved-squad order with no nulls or duplicates. The
  -- old and new orders are audited.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_set_tiebreak_order'
    and pg_get_functiondef(p.oid) like '%league_require_admin%'
    and pg_get_functiondef(p.oid) like '%status not in (''ACTIVE'',''COMPLETED'')%'
    and pg_get_functiondef(p.oid) like '%char_length(btrim(p_reason)) not between 3 and 1000%'
    and pg_get_functiondef(p.oid) like '%Tiebreak order cannot contain null ids.%'
    and pg_get_functiondef(p.oid) like '%Tiebreak order contains duplicate squads.%'
    and pg_get_functiondef(p.oid) like '%Tiebreak order must include every approved squad.%'
    and pg_get_functiondef(p.oid) like '%Tiebreak order contains a squad outside this season.%'
    and pg_get_functiondef(p.oid) like '%delete from public.league_tiebreak_orders%'
    and pg_get_functiondef(p.oid) like '%insert into public.league_tiebreak_orders%'
    and pg_get_functiondef(p.oid) like '%TIEBREAK_ORDER_SET%';
  if n < 1 then
    raise exception 'A3 FAIL: league_set_tiebreak_order is missing an admin, season, order or audit guard';
  end if;

  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_tiebreak_orders'::regclass
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) like '%(season_id, team_id)%';
  if n < 1 then
    raise exception 'A3 FAIL: tiebreak order lacks unique (season_id, team_id)';
  end if;

  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_tiebreak_orders'::regclass
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) like '%(season_id, position)%';
  if n < 1 then
    raise exception 'A3 FAIL: tiebreak order lacks unique (season_id, position)';
  end if;
  raise notice 'A3 ok: tiebreak order is complete, unique and audited';

  -- A4. Squad statistics expose the UI contract, count final fixtures only,
  -- include penalty points and derive duel/goal aggregates from final duels.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_team_stats'
    and pg_get_function_result(p.oid) like '%team_id%'
    and pg_get_function_result(p.oid) like '%team_name%'
    and pg_get_function_result(p.oid) like '%played%'
    and pg_get_function_result(p.oid) like '%wins%'
    and pg_get_function_result(p.oid) like '%draws%'
    and pg_get_function_result(p.oid) like '%losses%'
    and pg_get_function_result(p.oid) like '%duels_won%'
    and pg_get_function_result(p.oid) like '%duels_lost%'
    and pg_get_function_result(p.oid) like '%duel_diff%'
    and pg_get_function_result(p.oid) like '%goals_for%'
    and pg_get_function_result(p.oid) like '%goals_against%'
    and pg_get_function_result(p.oid) like '%points%'
    and pg_get_functiondef(p.oid) like '%d.status in (''CONFIRMED'',''FORFEITED'')%'
    and pg_get_functiondef(p.oid) like '%public.league_penalties%'
    and pg_get_functiondef(p.oid) like '%order by points desc, duel_diff desc, duels_won desc%';
  if n < 1 then
    raise exception 'A4 FAIL: league_team_stats is missing a column, final-only filter or penalty total';
  end if;
  raise notice 'A4 ok: squad statistics include final fixtures, goals and penalties';

  -- A5. Player statistics expose the UI contract and aggregate final duels by
  -- player and squad with a rounded win rate.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_player_stats'
    and pg_get_function_result(p.oid) like '%player_id%'
    and pg_get_function_result(p.oid) like '%player_name%'
    and pg_get_function_result(p.oid) like '%team_id%'
    and pg_get_function_result(p.oid) like '%team_name%'
    and pg_get_function_result(p.oid) like '%duels_played%'
    and pg_get_function_result(p.oid) like '%duels_won%'
    and pg_get_function_result(p.oid) like '%duels_lost%'
    and pg_get_function_result(p.oid) like '%goals_for%'
    and pg_get_function_result(p.oid) like '%goals_against%'
    and pg_get_function_result(p.oid) like '%goal_diff%'
    and pg_get_function_result(p.oid) like '%win_rate%'
    and pg_get_functiondef(p.oid) like '%d.status in (''CONFIRMED'',''FORFEITED'')%'
    and pg_get_functiondef(p.oid) like '%round(100.0 * sum(s.sr_won)%'
    and pg_get_functiondef(p.oid) like '%group by%';
  if n < 1 then
    raise exception 'A5 FAIL: league_player_stats is missing a column, final-only filter or win rate';
  end if;
  raise notice 'A5 ok: player statistics aggregate final duels with a win rate';

  -- A6. Penalties and tiebreak orders are readable by authenticated users and
  -- writable only through RPCs. RLS is enabled on both tables.
  select count(*) into n
  from pg_class c
  where c.oid in (
    'public.league_penalties'::regclass,
    'public.league_tiebreak_orders'::regclass
  )
    and c.relrowsecurity = true;
  if n < 2 then
    raise exception 'A6 FAIL: RLS is missing on penalties/tiebreak orders';
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename in ('league_penalties', 'league_tiebreak_orders')
    and cmd = 'SELECT'
    and qual like '%true%';
  if n < 2 then
    raise exception 'A6 FAIL: authenticated read policies are missing for penalties/tiebreak orders';
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename in ('league_penalties', 'league_tiebreak_orders')
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if n > 0 then
    raise exception 'A6 FAIL: % Phase 6 write policies exist (writes must be RPC-only)', n;
  end if;
  raise notice 'A6 ok: Phase 6 reads are RLS-gated and writes are RPC-only';

  -- A7. The five Phase 6 RPCs are executable by authenticated and denied to
  -- anon; internal helpers remain non-client-executable.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'league_standings',
      'league_player_stats',
      'league_team_stats',
      'league_apply_penalty',
      'league_set_tiebreak_order'
    )
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if n < 5 then
    raise exception 'A7 FAIL: only % of 5 Phase 6 RPCs are executable by authenticated', n;
  end if;

  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'league_standings',
      'league_player_stats',
      'league_team_stats',
      'league_apply_penalty',
      'league_set_tiebreak_order'
    )
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if n > 0 then
    raise exception 'A7 FAIL: % Phase 6 RPCs are executable by anon', n;
  end if;

  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('league_require_active', 'league_require_admin', 'league_audit')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if n > 0 then
    raise exception 'A7 FAIL: internal league helpers are client-executable';
  end if;
  raise notice 'A7 ok: Phase 6 grants are narrow and anon is denied';

  -- A8. Penalties are indexed for season/team reads; audit logs remain
  -- staff-readable, and penalties are published for realtime invalidation.
  select count(*) into n
  from pg_indexes i
  where i.schemaname = 'public'
    and i.tablename = 'league_penalties'
    and i.indexname = 'league_penalties_team_idx'
    and i.indexdef like '%(season_id, team_id)%';
  if n < 1 then
    raise exception 'A8 FAIL: league_penalties_team_idx is missing';
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename = 'league_audit_logs'
    and cmd = 'SELECT'
    and qual like '%is_clan_role%';
  if n < 1 then
    raise exception 'A8 FAIL: audit logs are not staff-readable';
  end if;

  select count(*) into n
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'league_penalties';
  if n < 1 then
    raise exception 'A8 FAIL: penalties are not published for realtime';
  end if;
  raise notice 'A8 ok: penalties are indexed, audited and published';

  -- A9. Reason constraints and positive tiebreak positions are enforced at
  -- table level as a final guard against direct SQL mistakes.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_tiebreak_orders'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%position > 0%';
  if n < 1 then
    raise exception 'A9 FAIL: tiebreak positions are not constrained to positive values';
  end if;

  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_tiebreak_orders'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%char_length%'
    and pg_get_constraintdef(c.oid) like '%1000%';
  if n < 1 then
    raise exception 'A9 FAIL: tiebreak reason length is not constrained';
  end if;
  raise notice 'A9 ok: table-level order and reason guards are present';

  raise notice 'PART A COMPLETE: all automated Phase 6 assertions passed.';
end $$;

-- ================= PART B: manual hand-computed checklist =================
-- Setup: 1 ACTIVE season, 4 APPROVED squads A/B/C/D, all fixtures final.
-- Expected fixture results:
--   MD1: A 2-2 B, C 3-1 D
--   MD2: A 3-1 C, B 2-2 D
--   MD3: A 2-2 D, B 3-1 C
-- Expected before penalties:
--   A: P3 W1 D2 L0, duels 7-5, diff +2, fixture points 5.
--   B: P3 W1 D2 L0, duels 7-5, diff +2, fixture points 5.
--   C: P3 W1 D0 L2, duels 5-7, diff -2, fixture points 3.
--   D: P3 W0 D2 L1, duels 5-7, diff -2, fixture points 2.
-- A and B are tied on points, duel difference and duels won. Their head-to-head
-- fixture is 2-2, so each has 1 h2h point. The admin tiebreak order decides.
--
-- B1. Standings page: verify the automatic order is A then B until an admin
-- tiebreak order is saved; verify C then D. Save B before A and refresh both
-- the page and a second account; verify B is first and the note appears.
-- B2. 2-2 handling: verify A/B each receive 1 fixture point, 2 duels won and
-- 2 duels lost; the table shows P3 W1 D2 L0 and no loss.
-- B3. Penalty: apply -4 to C with a real reason. Verify C drops to -1 points,
-- D moves above C, the standings page shows the penalty adjustment, the C
-- squad receives a notification, and staff audit logs include PENALTY_APPLIED.
-- B4. Penalty validation: try 0, 101, -101, a 2-character reason, a squad from
-- another season and a matchday from another season; all must fail. Verify
-- archived seasons reject penalties.
-- B5. Tiebreak validation: try a partial list, duplicate squad, null id, a
-- squad from another season, a 2-character reason and a DRAFT season; all must
-- fail. Verify a COMPLETED season accepts the full order and audit logs include
-- TIEBREAK_ORDER_SET with old and new order.
-- B6. Player stats: verify each player's duels played/won/lost, goals for and
-- against and win rate from the final duels only. A player with 3 wins from 4
-- duels must show 75%. A player with no final duel must be absent.
-- B7. Squad stats: verify P/W/D/L, duels won/lost/diff, goals for/against and
-- points include penalties. Totals must match the standings rows.
-- B8. Security: as an unrelated authenticated member, read penalties and
-- tiebreak order through PostgREST (allowed), then try INSERT/UPDATE/DELETE
-- directly (denied). As a non-admin, call both write RPCs (denied). As anon,
-- call all five RPCs (denied).
-- B9. Repeat B1-B3 with 8 squads and confirm the same rules at the larger
-- table size; then verify EN/FR/AR labels and RTL layout on both pages.
