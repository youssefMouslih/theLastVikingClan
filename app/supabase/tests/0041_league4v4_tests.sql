-- VIK Clan 0041 tests: 4vs4 League authoritative RPCs.
-- Run AFTER 0041_league4v4_functions.sql in the Supabase SQL editor.
--
-- PART A (automated): catalog, privilege and guard-shape assertions.
-- PART B (manual, needs real JWT users + storage): end-to-end RPC checks.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
  expected_public text[] := array[
    'league_create_season','league_update_season','league_set_season_status',
    'league_generate_fixtures','league_extend_matchday','league_approve_team',
    'league_replace_member','league_apply_penalty','league_set_tiebreak_order',
    'league_create_team','league_update_team','league_invite_member',
    'league_answer_invite','league_leave_team','league_remove_member',
    'league_transfer_captain','league_submit_lineup','league_start_duel',
    'league_substitute_player','league_submit_duel_result',
    'league_confirm_duel_result','league_dispute_duel','league_resolve_dispute',
    'league_standings','league_player_stats','league_team_stats'
  ];
  expected_internal text[] := array[
    'league_require_active','league_require_admin',
    'league_require_dispute_staff','league_require_captain',
    'league_audit','league_notify','league_notify_team','league_notify_staff',
    'league_notify_season','league_lock_season','league_lock_team',
    'league_lock_matchday','league_lock_fixture','league_lock_duel',
    'league_validate_evidence','league_maybe_reveal_fixture',
    'league_finalize_fixture'
  ];
  expected_all text[] := expected_public || expected_internal;
begin
  -- A1. Every 0041 function exists, is SECURITY DEFINER and pins search_path.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = any(expected_all)
    and p.prosecdef = true
    and p.proconfig is not null
    and array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%';
  if n < array_length(expected_all, 1) then
    raise exception 'A1 FAIL: only % of % 0041 functions are definer + pinned',
      n, array_length(expected_all, 1);
  end if;
  raise notice 'A1 ok: % functions are SECURITY DEFINER with pinned search_path', n;

  -- A2. Public RPCs are executable by authenticated users only.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = any(expected_public)
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE');
  if n < array_length(expected_public, 1) then
    raise exception 'A2 FAIL: only % of % public RPCs are authenticated-only',
      n, array_length(expected_public, 1);
  end if;
  raise notice 'A2 ok: % public RPCs are authenticated-only', n;

  -- A3. Internal helpers are not callable by anon or authenticated clients.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = any(expected_internal)
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if n < array_length(expected_internal, 1) then
    raise exception 'A3 FAIL: only % of % internal helpers are client-hidden',
      n, array_length(expected_internal, 1);
  end if;
  raise notice 'A3 ok: % internal helpers are not client-callable', n;

  -- A4. No 0041 function still grants EXECUTE to PUBLIC.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = any(expected_all)
    and (
      p.proacl is null
      or exists (
        select 1 from aclexplode(p.proacl) a
        where a.grantee = 0 and a.privilege_type = 'EXECUTE'
      )
    );
  if n > 0 then
    raise exception 'A4 FAIL: % 0041 functions still grant EXECUTE to PUBLIC', n;
  end if;
  raise notice 'A4 ok: no 0041 function grants EXECUTE to PUBLIC';

  -- A5. All mutating RPCs are volatile; read models are stable.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = any(expected_public)
    and p.proname not in ('league_standings','league_player_stats','league_team_stats')
    and p.provolatile = 'v';
  if n < array_length(expected_public, 1) - 3 then
    raise exception 'A5 FAIL: only % of % mutating RPCs are volatile',
      n, array_length(expected_public, 1) - 3;
  end if;

  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('league_standings','league_player_stats','league_team_stats')
    and p.provolatile = 's';
  if n < 3 then
    raise exception 'A5 FAIL: only % of 3 read models are stable', n;
  end if;
  raise notice 'A5 ok: 23 mutating RPCs volatile, 3 read models stable';

  -- A6. Every mutating RPC delegates to one of the active-member gates.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = any(expected_public)
    and p.proname not in ('league_standings','league_player_stats','league_team_stats')
    and (
      pg_get_functiondef(p.oid) like '%league_require_active%'
      or pg_get_functiondef(p.oid) like '%league_require_admin%'
      or pg_get_functiondef(p.oid) like '%league_require_captain%'
      or pg_get_functiondef(p.oid) like '%league_require_dispute_staff%'
    );
  if n < array_length(expected_public, 1) - 3 then
    raise exception 'A6 FAIL: only % of % mutating RPCs use an active-member gate',
      n, array_length(expected_public, 1) - 3;
  end if;
  raise notice 'A6 ok: all 23 mutating RPCs authenticate through an active-member gate';

  -- A7. Result/dispute RPCs use server-side evidence validation and the
  -- fixture finalizer instead of client-provided winners or points.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('league_submit_duel_result','league_dispute_duel')
    and pg_get_functiondef(p.oid) like '%league_validate_evidence%';
  if n < 2 then
    raise exception 'A7 FAIL: result/dispute RPCs do not validate evidence';
  end if;

  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'league_submit_duel_result','league_confirm_duel_result','league_resolve_dispute'
    )
    and pg_get_functiondef(p.oid) like '%league_finalize_fixture%';
  if n < 3 then
    raise exception 'A7 FAIL: result RPCs do not finalize fixtures server-side';
  end if;
  raise notice 'A7 ok: evidence validation and fixture finalization are server-side';

  -- A8. Standings expose a non-reserved position column and both tiebreak
  -- stages (head-to-head and admin order).
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_standings'
    and pg_get_function_result(p.oid) like '%standing_position%'
    and pg_get_functiondef(p.oid) like '%b_h2h_points%'
    and pg_get_functiondef(p.oid) like '%league_tiebreak_orders%';
  if n < 1 then
    raise exception 'A8 FAIL: standings lack position/head-to-head/tiebreak logic';
  end if;
  raise notice 'A8 ok: standings expose standing_position, head-to-head and admin tiebreak';

  -- A9. Lineup submission is captain-only, shape-checked and reveal-driven.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_submit_lineup'
    and pg_get_functiondef(p.oid) like '%t.captain_id = v_me%'
    and pg_get_functiondef(p.oid) like '%jsonb_array_elements%'
    and pg_get_functiondef(p.oid) like '%league_maybe_reveal_fixture%';
  if n < 1 then
    raise exception 'A9 FAIL: lineup submission lacks captain/shape/reveal checks';
  end if;
  raise notice 'A9 ok: lineup submission is captain-only, shape-checked and reveal-driven';

  -- A10. Result submission locks substitutions and creates a dispute on a
  -- mirrored-score mismatch.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_submit_duel_result'
    and pg_get_functiondef(p.oid) like '%score_for = v_report.score_against%'
    and pg_get_functiondef(p.oid) like '%status = ''DISPUTED''%';
  if n < 1 then
    raise exception 'A10 FAIL: result mismatch/dispute path missing';
  end if;
  raise notice 'A10 ok: mirrored results auto-confirm; mismatches open a dispute';

  -- A11. The migration is additive: the War Council squads table and service
  -- are not referenced by any 0041 function.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = any(expected_all)
    and (
      pg_get_functiondef(p.oid) like '%public.squads%'
      or pg_get_functiondef(p.oid) like '%squad_members%'
    );
  if n > 0 then
    raise exception 'A11 FAIL: % 0041 functions reference War Council squads', n;
  end if;
  raise notice 'A11 ok: 0041 functions do not touch War Council squads';

  -- A12. Substitutions are captain-only, bench-only and lock after start/report.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_substitute_player'
    and pg_get_functiondef(p.oid) like '%t.captain_id = v_me%'
    and pg_get_functiondef(p.oid) like '%lp.role = ''SUB''%'
    and pg_get_functiondef(p.oid) like '%league_team_members%'
    and pg_get_functiondef(p.oid) like '%started_at is not null%'
    and pg_get_functiondef(p.oid) like '%league_duel_reports%';
  if n < 1 then
    raise exception 'A12 FAIL: substitution lacks bench/member/lock checks';
  end if;
  raise notice 'A12 ok: substitutions are bench/member-checked and lock after start/report';

  raise notice 'PART A COMPLETE: all automated 0041 assertions passed.';
end $$;

-- ================= PART B: manual end-to-end checklist =================
-- B1. Season lifecycle (OWNER/ADMIN).
--   Call league_create_season(...), move DRAFT -> REGISTRATION with
--   league_set_season_status, create 4 squads, invite 6-8 active members each,
--   then approve every squad. EXPECT approval to fail outside roster limits.
--   Generate fixtures, then move REGISTRATION -> ACTIVE. EXPECT ACTIVE to fail
--   until the approved team count and generated matchday/fixture counts match.
--
-- B2. Captain/roster ownership.
--   As a non-captain, call league_update_team, league_invite_member,
--   league_remove_member, league_transfer_captain and league_submit_lineup.
--   EXPECT "only ... captain" errors. As a captain, try to invite a player who
--   already has an active squad this season. EXPECT rejection. After ACTIVE,
--   league_invite_member, league_answer_invite, league_leave_team and
--   league_remove_member must fail with the roster-lock error.
--
-- B3. Lineup privacy and shape.
--   Submit one lineup; EXPECT opponent cannot select its rows and fixture stays
--   LINEUPS_PENDING. Submit the second; EXPECT both lineups become REVEALED and
--   four league_duels are created. Submit 3 starters, 1 sub, 5 subs, duplicate
--   players or duplicate slots. EXPECT each attempt to fail.
--
-- B4. Result integrity.
--   As an assigned player, submit a decisive result with evidence under
--   league/{season}/{fixture}/{duel}/{player}-file. EXPECT duel
--   AWAITING_RESULTS. Submit the mirrored result from the opponent. EXPECT both
--   reports CONFIRMED, the fixture duel tally to increment and the fixture to
--   finalize only after all four duels.
--
-- B5. Mismatch/dispute.
--   Submit different scores from the two players. EXPECT both reports DISPUTED,
--   duel DISPUTED, a league_disputes row OPEN, and staff notifications. As
--   OWNER/ADMIN/MODERATOR, call league_resolve_dispute with a decisive score.
--   EXPECT the duel CONFIRMED or FORFEITED, reports closed, and the fixture
--   finalized once four duels are decided.
--
-- B6. Substitution lock.
--   Before start, substitute a bench player who is in the SUB slot. EXPECT the
--   duel player changes and league_substitutions records it. Try a player who
--   is not an active squad member or not on the bench. EXPECT rejection. Start
--   the duel, then retry. EXPECT "locked after the duel starts." Submit a
--   report, retry. EXPECT "locked after a result is reported."
--
-- B7. Direct writes and privilege escalation.
--   As an authenticated client, try to EXECUTE league_require_active,
--   league_audit, league_lock_duel, league_validate_evidence or
--   league_finalize_fixture. EXPECT permission denied. Try to INSERT/UPDATE/
--   DELETE any league_* table directly. EXPECT RLS denial.
--
-- B8. Standings and stats.
--   After finalizing fixtures, call league_standings, league_player_stats and
--   league_team_stats. EXPECT 3/1/0 fixture points, penalty adjustments,
--   duel differential, head-to-head ordering, admin tiebreak ordering and no
--   rows for unapproved squads.
--
-- B9. Admin replacement.
--   As OWNER/ADMIN, call league_replace_member for a non-captain and for a
--   captain. EXPECT history preserved, one-for-one roster size, captain_id
--   updated, and pending invites resolved. During a matchday window or with an
--   open submitted lineup, EXPECT the replacement to fail.
--
-- B10. Tiebreak and penalties.
--   Apply a negative league_apply_penalty and set a full
--   league_set_tiebreak_order. EXPECT standings points/diff and the admin order
--   to change; deleting a tiebreak team or passing a duplicate must fail.
