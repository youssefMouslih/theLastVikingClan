-- VIK Clan Phase 4 tests: hidden lineups, reveal, duels, substitutions.
-- Run AFTER 0040_league4v4_schema.sql and 0041_league4v4_functions.sql.
--
-- PART A (automated): policy, constraint, publication and function-shape checks.
-- PART B (manual, needs real JWT users): adversarial two-account checks.
--
-- These tests do not invent data. PART A only inspects the deployed catalog.
-- PART B must be executed with the Supabase SQL editor as service_role for
-- setup, then with real authenticated JWTs (or PostgREST) for each client.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
begin
  -- A1. The lineup table is protected by the definer visibility helper, not
  -- by a permissive policy. Opponent rows must disappear until reveal.
  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename = 'league_lineups'
    and policyname = 'league read visible lineups'
    and qual like '%league_can_view_lineup%';
  if n < 1 then
    raise exception 'A1 FAIL: league_lineups is missing the visibility policy';
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename = 'league_lineup_players'
    and policyname = 'league read visible lineup players'
    and qual like '%league_can_view_lineup_player%';
  if n < 1 then
    raise exception 'A1 FAIL: league_lineup_players is missing the visibility policy';
  end if;
  raise notice 'A1 ok: lineup and lineup-player reads go through the visibility helpers';

  -- A2. The helper reveals to staff and to the owning squad, then to the
  -- opponent only after the fixture is revealed. A cancelled fixture is not
  -- treated as revealed.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_can_view_lineup'
    and pg_get_functiondef(p.oid) like '%is_clan_role%'
    and pg_get_functiondef(p.oid) like '%OWNER%'
    and pg_get_functiondef(p.oid) like '%ADMIN%'
    and pg_get_functiondef(p.oid) like '%MODERATOR%'
    and pg_get_functiondef(p.oid) like '%league_is_team_member(p_team_id, v_uid)%'
    and pg_get_functiondef(p.oid) like '%LINEUPS_REVEALED%'
    and pg_get_functiondef(p.oid) like '%IN_PROGRESS%'
    and pg_get_functiondef(p.oid) like '%COMPLETED%'
    and pg_get_functiondef(p.oid) like '%FORFEITED%';
  if n < 1 then
    raise exception 'A2 FAIL: league_can_view_lineup does not match the reveal matrix';
  end if;
  raise notice 'A2 ok: staff/own squad see lineups; opponents only after reveal';

  -- A3. Reveal is idempotent and creates one duel per slot 1-4.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_maybe_reveal_fixture'
    and pg_get_functiondef(p.oid) like '%for v_slot in 1..4 loop%'
    and pg_get_functiondef(p.oid) like '%on conflict (fixture_id, slot) do nothing%'
    and pg_get_functiondef(p.oid) like '%status = ''LINEUPS_REVEALED''%'
    and pg_get_functiondef(p.oid) like '%status = ''REVEALED''%';
  if n < 1 then
    raise exception 'A3 FAIL: reveal function is not slot-1..4 idempotent';
  end if;

  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_duels'::regclass
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) like '%(fixture_id, slot)%';
  if n < 1 then
    raise exception 'A3 FAIL: league_duels lacks unique (fixture_id, slot)';
  end if;
  raise notice 'A3 ok: reveal creates exactly one duel per slot and cannot duplicate slots';

  -- A4. A substitution is one atomic RPC: it locks the duel, verifies the
  -- captain, bench and active membership, blocks after start/report, inserts
  -- the audit row and reassigns the duel.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_substitute_player'
    and pg_get_functiondef(p.oid) like '%league_lock_duel%'
    and pg_get_functiondef(p.oid) like '%t.captain_id = v_me%'
    and pg_get_functiondef(p.oid) like '%lp.role = ''SUB''%'
    and pg_get_functiondef(p.oid) like '%league_team_members%'
    and pg_get_functiondef(p.oid) like '%started_at is not null%'
    and pg_get_functiondef(p.oid) like '%league_duel_reports%'
    and pg_get_functiondef(p.oid) like '%insert into public.league_substitutions%'
    and pg_get_functiondef(p.oid) like '%update public.league_duels set home_player_id%'
    and pg_get_functiondef(p.oid) like '%update public.league_duels set away_player_id%';
  if n < 1 then
    raise exception 'A4 FAIL: substitution RPC is missing a lock, eligibility or reassignment step';
  end if;

  -- One substitution per squad per duel, and a bench player can only enter
  -- once per fixture for that squad.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_substitutions'::regclass
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) like '%(duel_id, team_id)%';
  if n < 1 then
    raise exception 'A4 FAIL: league_substitutions lacks unique (duel_id, team_id)';
  end if;

  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_substitutions'::regclass
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) like '%(fixture_id, team_id, in_player_id)%';
  if n < 1 then
    raise exception 'A4 FAIL: league_substitutions lacks unique (fixture_id, team_id, in_player_id)';
  end if;

  -- A substituted-out starter cannot be reassigned twice in the same duel.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_duels'::regclass
    and c.contype = 'u'
    and (
      pg_get_constraintdef(c.oid) like '%(fixture_id, home_player_id)%'
      or pg_get_constraintdef(c.oid) like '%(fixture_id, away_player_id)%'
    );
  if n < 2 then
    raise exception 'A4 FAIL: league_duels lacks assigned-player uniqueness';
  end if;
  raise notice 'A4 ok: substitution locks and uniqueness constraints are present';

  -- A5. Only the assigned players may start a duel, and the fixture moves to
  -- IN_PROGRESS once a duel starts.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_start_duel'
    and pg_get_functiondef(p.oid) like '%v_me = v_duel.home_player_id%'
    and pg_get_functiondef(p.oid) like '%v_me = v_duel.away_player_id%'
    and pg_get_functiondef(p.oid) like '%Only the assigned duel players%'
    and pg_get_functiondef(p.oid) like '%status = ''STARTED''%'
    and pg_get_functiondef(p.oid) like '%status = ''IN_PROGRESS''%';
  if n < 1 then
    raise exception 'A5 FAIL: duel start is not participant-only';
  end if;
  raise notice 'A5 ok: only assigned players can start a duel';

  -- A6. Realtime publication includes lineups and duels so the match page can
  -- invalidate the hidden/revealed state without a manual refresh.
  select count(*) into n
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename in ('league_lineups', 'league_duels');
  if n < 2 then
    raise exception 'A6 FAIL: league_lineups/league_duels are not published for realtime';
  end if;
  raise notice 'A6 ok: lineups and duels are in the realtime publication';

  -- A7. RLS is enabled on the three Phase 4 tables. Writes stay RPC-only:
  -- there must be no INSERT/UPDATE/DELETE policy on them.
  select count(*) into n
  from pg_class c
  where c.oid in (
    'public.league_lineups'::regclass,
    'public.league_lineup_players'::regclass,
    'public.league_duels'::regclass
  )
    and c.relrowsecurity = true;
  if n < 3 then
    raise exception 'A7 FAIL: RLS is missing on a Phase 4 table';
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename in ('league_lineups', 'league_lineup_players', 'league_duels')
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if n > 0 then
    raise exception 'A7 FAIL: % Phase 4 write policies exist (writes must be RPC-only)', n;
  end if;
  raise notice 'A7 ok: Phase 4 reads are RLS-gated and writes are RPC-only';

  raise notice 'PART A COMPLETE: all automated Phase 4 assertions passed.';
end $$;

-- ================= PART B: manual adversarial checklist =================
-- Setup: create 1 ACTIVE season, 2 APPROVED squads (A and B), 6-8 ACTIVE
-- members each (two real JWT accounts per squad are enough for the client
-- checks; the rest can be seeded members). Generate fixtures and activate the
-- season before running these checks.
--
-- B1. Hidden lineup (two accounts, direct PostgREST or SQL with JWT).
--   As captain A submit a valid lineup for the fixture.
--   EXPECT:
--   - A can SELECT its 6-8 league_lineups / league_lineup_players rows.
--   - B receives 0 rows for A's lineup id and 0 lineup_players rows, even
--     when querying the id directly.
--   - B cannot infer A's players from league_duels (there are still 0 rows).
--   - Staff (OWNER/ADMIN/MODERATOR) can SELECT both lineups before reveal.
--   - A's fixture status is still SCHEDULED or LINEUPS_PENDING, never
--     LINEUPS_REVEALED.
--
-- B2. Simultaneous reveal.
--   As captain B submit a valid lineup.
--   EXPECT:
--   - A's and B's lineups become REVEALED in the same transaction.
--   - The fixture becomes LINEUPS_REVEALED with revealed_at set.
--   - Exactly 4 league_duels exist, slots 1-4, one per slot.
--   - Slot N home player equals A's starter at slot N and slot N away player
--     equals B's starter at slot N.
--   - Calling league_maybe_reveal_fixture again is a no-op (still 4 duels).
--
-- B3. Lineup shape.
--   As captain A submit: 3 starters; 1 sub; 5 subs; duplicate player;
--   duplicate slot; a player from another squad; a player from B's squad.
--   EXPECT each submission to fail and the previous valid lineup to remain.
--
-- B4. Realtime.
--   Open the match page as a third squad member and as the staff account.
--   Subscribe to league_lineups and league_duels.
--   EXPECT:
--   - B's reveal updates A's and B's match page without a manual refresh.
--   - Editing A's lineup before reveal refreshes only A/staff.
--   - Starting a duel or recording a substitution refreshes both squads.
--   - Lineup player rows never appear in a realtime payload to B before
--     reveal (RLS applies to realtime).
--
-- B5. Substitution before start.
--   As captain A substitute a bench player (role SUB) for the duel's assigned
--   home player before the duel starts.
--   EXPECT:
--   - league_substitutions gets one row with out/in/team/requested_by.
--   - The duel home_player_id changes to the substitute.
--   - Repeating any substitution for the same (duel, team) fails.
--   - Using the same in_player in another duel for A fails.
--   - A player who is not on A's bench, not ACTIVE, or from B fails.
--   - B's captain cannot substitute A's player.
--   - A non-captain member cannot substitute.
--
-- B6. Substitution lock.
--   Start the duel as an assigned player.
--   EXPECT status STARTED, started_at set, fixture IN_PROGRESS.
--   Retry a substitution. EXPECT "locked after the duel starts."
--   Submit a result for the duel, then retry. EXPECT "locked after a result
--   is reported." A third party cannot start the duel.
--
-- B7. Direct writes.
--   As authenticated clients, try INSERT/UPDATE/DELETE on league_lineups,
--   league_lineup_players, league_duels, league_substitutions and
--   league_duel_reports. EXPECT RLS denial.
--   Try EXECUTE on league_lock_duel, league_maybe_reveal_fixture and
--   league_finalize_fixture. EXPECT permission denied.
