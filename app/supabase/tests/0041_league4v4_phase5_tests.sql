-- VIK Clan Phase 5 tests: results, evidence, confirmation, disputes, resolution.
-- Run AFTER 0040_league4v4_schema.sql and 0041_league4v4_functions.sql.
--
-- PART A (automated): function-shape, policy, grant and constraint checks.
-- PART B (manual, needs real JWT users): adversarial two-account checks.
--
-- These tests do not invent data. PART A only inspects the deployed catalog.
-- PART B must be executed with real authenticated clients; the automatic
-- mismatch path also needs two uploaded evidence objects in match-evidence.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
begin
  -- A1. Evidence is validated against the private match-evidence bucket:
  -- exact league/{season}/{fixture}/{duel}/{player}-file shape, owned by the
  -- reporting player, max 5 MB and JPEG/PNG/WebP only.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_validate_evidence'
    and pg_get_functiondef(p.oid) like '%''match-evidence''%'
    and pg_get_functiondef(p.oid) like '%array_length(v_parts, 1) is distinct from 5%'
    and pg_get_functiondef(p.oid) like '%o.owner::text = p_player_id::text%'
    and pg_get_functiondef(p.oid) like '%5242880%'
    and pg_get_functiondef(p.oid) like '%image/jpeg%'
    and pg_get_functiondef(p.oid) like '%image/png%'
    and pg_get_functiondef(p.oid) like '%image/webp%';
  if n < 1 then
    raise exception 'A1 FAIL: league_validate_evidence does not enforce the evidence contract';
  end if;
  raise notice 'A1 ok: evidence path, owner, size and MIME are server-validated';

  -- A2. Result submission is participant-only, locks the season/fixture/duel,
  -- requires a decisive score and evidence, auto-confirms mirrored reports,
  -- auto-opens a dispute on mismatch, and finalizes the fixture.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_submit_duel_result'
    and pg_get_functiondef(p.oid) like '%league_lock_season%'
    and pg_get_functiondef(p.oid) like '%league_lock_fixture%'
    and pg_get_functiondef(p.oid) like '%league_lock_duel%'
    and pg_get_functiondef(p.oid) like '%Only the assigned duel players can report a result.%'
    and pg_get_functiondef(p.oid) like '%Duel scores must be decisive.%'
    and pg_get_functiondef(p.oid) like '%league_validate_evidence%'
    and pg_get_functiondef(p.oid) like '%v_opponent_report.score_for = v_report.score_against%'
    and pg_get_functiondef(p.oid) like '%DUEL_CONFIRMED%'
    and pg_get_functiondef(p.oid) like '%insert into public.league_disputes%'
    and pg_get_functiondef(p.oid) like '%LEAGUE_DUEL_DISPUTED%'
    and pg_get_functiondef(p.oid) like '%league_finalize_fixture%';
  if n < 1 then
    raise exception 'A2 FAIL: submit result is missing a participant, evidence, mirror or finalize step';
  end if;
  raise notice 'A2 ok: submission auto-confirms matches, disputes mismatches and finalizes';

  -- A3. One-tap confirmation is opponent-only, requires AWAITING_RESULTS, blocks
  -- self-confirmation and open disputes, derives the winner from the report and
  -- finalizes the fixture.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_confirm_duel_result'
    and pg_get_functiondef(p.oid) like '%v_duel.status <> ''AWAITING_RESULTS''%'
    and pg_get_functiondef(p.oid) like '%Only the assigned duel players can confirm a result.%'
    and pg_get_functiondef(p.oid) like '%Your own reported result must be resolved by staff.%'
    and pg_get_functiondef(p.oid) like '%This duel is under dispute review.%'
    and pg_get_functiondef(p.oid) like '%status = ''CONFIRMED''%'
    and pg_get_functiondef(p.oid) like '%league_finalize_fixture%';
  if n < 1 then
    raise exception 'A3 FAIL: confirm result is missing an opponent, dispute or finalize guard';
  end if;
  raise notice 'A3 ok: confirmation is opponent-only and finalizes the duel';

  -- A4. Manual disputes require a 3-1000 char reason, optional owned evidence,
  -- and allow only a participant or the approved squad captain. Opening one
  -- freezes submitted reports and notifies staff.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_dispute_duel'
    and pg_get_functiondef(p.oid) like '%char_length(btrim(p_reason)) not between 3 and 1000%'
    and pg_get_functiondef(p.oid) like '%t.captain_id = v_me%'
    and pg_get_functiondef(p.oid) like '%Only a duel participant or their captain can open a dispute.%'
    and pg_get_functiondef(p.oid) like '%insert into public.league_disputes%'
    and pg_get_functiondef(p.oid) like '%status = ''DISPUTED''%'
    and pg_get_functiondef(p.oid) like '%league_notify_staff%';
  if n < 1 then
    raise exception 'A4 FAIL: dispute RPC is missing a reason, captain or freeze guard';
  end if;
  raise notice 'A4 ok: disputes are participant/captain-only and freeze reports';

  -- A5. Staff resolution requires OWNER/ADMIN/MODERATOR, an open dispute, a
  -- valid winner, decisive scores unless forfeit, rejects/confirms reports,
  -- updates the fixture and records an audit row.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'league_resolve_dispute'
    and pg_get_functiondef(p.oid) like '%league_require_dispute_staff%'
    and pg_get_functiondef(p.oid) like '%This dispute is already closed.%'
    and pg_get_functiondef(p.oid) like '%The winning team must be part of this duel.%'
    and pg_get_functiondef(p.oid) like '%The winner does not match the reported score.%'
    and pg_get_functiondef(p.oid) like '%coalesce(p_forfeit, false)%'
    and pg_get_functiondef(p.oid) like '%status = ''FORFEITED''%'
    and pg_get_functiondef(p.oid) like '%status = ''RESOLVED''%'
    and pg_get_functiondef(p.oid) like '%league_finalize_fixture%'
    and pg_get_functiondef(p.oid) like '%DISPUTE_RESOLVED%';
  if n < 1 then
    raise exception 'A5 FAIL: dispute resolution is missing a staff, winner or audit guard';
  end if;
  raise notice 'A5 ok: staff resolution validates winner/scores and finalizes';

  -- A6. Reports and disputes are RLS-gated reads through the shared visibility
  -- helper. Writes stay RPC-only: no INSERT/UPDATE/DELETE policies.
  select count(*) into n
  from pg_class c
  where c.oid in (
    'public.league_duel_reports'::regclass,
    'public.league_disputes'::regclass
  )
    and c.relrowsecurity = true;
  if n < 2 then
    raise exception 'A6 FAIL: RLS is missing on league_duel_reports/league_disputes';
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename in ('league_duel_reports', 'league_disputes')
    and cmd = 'SELECT'
    and qual like '%league_can_view_duel_report%';
  if n < 2 then
    raise exception 'A6 FAIL: report/dispute read policies do not use league_can_view_duel_report';
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename in ('league_duel_reports', 'league_disputes')
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if n > 0 then
    raise exception 'A6 FAIL: % Phase 5 write policies exist (writes must be RPC-only)', n;
  end if;
  raise notice 'A6 ok: Phase 5 reads are RLS-gated and writes are RPC-only';

  -- A7. Realtime includes reports and disputes so the match page and dispute
  -- queue refresh without a manual reload.
  select count(*) into n
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename in ('league_duel_reports', 'league_disputes');
  if n < 2 then
    raise exception 'A7 FAIL: reports/disputes are not published for realtime';
  end if;
  raise notice 'A7 ok: reports and disputes are in the realtime publication';

  -- A8. Match players can execute the four Phase 5 RPCs; anon cannot. Internal
  -- finalize and evidence helpers remain non-client-executable.
  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'league_submit_duel_result',
      'league_confirm_duel_result',
      'league_dispute_duel',
      'league_resolve_dispute'
    )
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if n < 4 then
    raise exception 'A8 FAIL: only % of 4 Phase 5 RPCs are executable by authenticated', n;
  end if;

  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in (
      'league_submit_duel_result',
      'league_confirm_duel_result',
      'league_dispute_duel',
      'league_resolve_dispute'
    )
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if n > 0 then
    raise exception 'A8 FAIL: % Phase 5 RPCs are executable by anon', n;
  end if;

  select count(*) into n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('league_finalize_fixture', 'league_validate_evidence')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if n > 0 then
    raise exception 'A8 FAIL: internal finalize/evidence helpers are client-executable';
  end if;
  raise notice 'A8 ok: client RPC grants are narrow and anon is denied';

  -- A9. Data invariants: one report per duel/player and one open dispute per
  -- duel.
  select count(*) into n
  from pg_constraint c
  where c.conrelid = 'public.league_duel_reports'::regclass
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) like '%(duel_id, player_id)%';
  if n < 1 then
    raise exception 'A9 FAIL: league_duel_reports lacks unique (duel_id, player_id)';
  end if;

  select count(*) into n
  from pg_indexes i
  where i.schemaname = 'public'
    and i.tablename = 'league_disputes'
    and i.indexname = 'league_disputes_one_open_idx'
    and i.indexdef like '%UNIQUE%'
    and i.indexdef like '%OPEN%'
    and i.indexdef like '%UNDER_REVIEW%';
  if n < 1 then
    raise exception 'A9 FAIL: league_disputes lacks one-open-dispute partial unique index';
  end if;
  raise notice 'A9 ok: one report per player and one open dispute per duel are enforced';

  raise notice 'PART A COMPLETE: all automated Phase 5 assertions passed.';
end $$;

-- ================= PART B: manual adversarial checklist =================
-- Setup: 1 ACTIVE season, 2 APPROVED squads (A and B), revealed lineups,
-- 4 duels, and two real JWT accounts per squad. Upload real screenshots to
-- match-evidence using paths league/{season}/{fixture}/{duel}/{player}-file.
--
-- B1. Submit result.
--   As assigned player A1 submit the real score and screenshot.
--   EXPECT:
--   - The RPC succeeds; the report is SUBMITTED and the duel AWAITING_RESULTS.
--   - A2/B1/B2 can SELECT the report into view (both squads + staff), but no
--     client can INSERT/UPDATE/DELETE it directly.
--   - A non-assigned squad member cannot submit, even the captain.
--   - Submitting a draw, score >99, missing/foreign/oversized/wrong-MIME
--     evidence, or a path for another duel/player fails.
--
-- B2. Mirror confirmation.
--   As assigned opponent B1 submit the exact same score from the opposite side
--   with their own screenshot.
--   EXPECT:
--   - Both reports become CONFIRMED in one transaction, duel CONFIRMED.
--   - Fixture duel-win counters increase once and the fixture finalizes
--     automatically when all four duels are final.
--   - Re-submitting either report fails.
--
-- B3. One-tap confirmation.
--   Fresh duel: A1 submits a result, B1 does not submit.
--   EXPECT:
--   - B1 sees the report and confirms; both the report and duel CONFIRMED.
--   - B1 cannot confirm their own report.
--   - A third party cannot confirm, even with the duel id.
--
-- B4. Mismatch auto-dispute.
--   Fresh duel: A1 submits 5-3, B1 submits 4-3.
--   EXPECT:
--   - Both reports become DISPUTED, duel DISPUTED.
--   - Exactly one OPEN league_disputes row exists for the duel.
--   - Staff gets a notification; the dispute appears in the admin queue.
--   - Further confirm/submit calls fail until staff resolves.
--
-- B5. Manual dispute.
--   Fresh duel: as assigned player (or approved captain) open a dispute with
--   a 2-char reason -> fail; 3-1000 chars -> succeed.
--   EXPECT:
--   - One OPEN dispute, duel DISPUTED, submitted reports DISPUTED.
--   - Assigned opponent and their captain can read it; unrelated members get
--     0 rows.
--   - A second open dispute for the same duel is rejected by the RPC/index.
--   - A third party cannot open a dispute.
--
-- B6. Staff resolution.
--   As AUTHOR/MODERATOR open /4vs4/disputes, pick the winner and score, submit.
--   EXPECT:
--   - Dispute RESOLVED, duel CONFIRMED with the selected score, reports
--     CONFIRMED/REJECTED by matching the final score.
--   - The fixture duel-win counter changes once and finalizes when ready.
--   - Resolution note 2 chars fails; a winner not in the duel fails; a winner
--     that contradicts the score fails; a non-ACTIVE season fails.
--   - OWNER/ADMIN/MODERATOR succeed; an ordinary member fails.
--
-- B7. Forfeit.
--   Resolve another open dispute with forfeit=true and no scores.
--   EXPECT:
--   - Duel FORFEITED with null scores, winner set, reports REJECTED.
--   - Fixture counters/finalization still update correctly.
--
-- B8. Realtime.
--   Open the match page as both squads and the disputes page as staff.
--   EXPECT:
--   - A submitted/confirmed report refreshes both match pages.
--   - Auto/manual disputes appear in the staff queue without reload.
--   - Resolution removes the dispute from the queue and refreshes the fixture.
--
-- B9. Direct writes and grants.
--   As authenticated clients try INSERT/UPDATE/DELETE on league_duel_reports
--   and league_disputes. EXPECT RLS denial.
--   Try EXECUTE on league_finalize_fixture, league_validate_evidence and
--   league_maybe_reveal_fixture. EXPECT permission denied.
--   Try the four Phase 5 RPCs while not a participant/staff. EXPECT the
--   server-side role/participant errors, never a success.
