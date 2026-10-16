-- VIK Clan 0035 tests: server-side match confirmation.
-- Run AFTER 0035_server_confirm.sql in Supabase SQL editor.
--
-- PART A (automated, runs here): catalog assertions. Raises on failure.
-- PART B (manual): the two acceptance proofs — no double-award across tabs,
-- and tab-close still awards everything — plus staff-path checks.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
begin
  -- A1. The three public RPCs exist, SECURITY DEFINER, callable by authenticated.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname in (
      'confirm_match','admin_set_result','award_match_forfeit')
      and p.prosecdef = true
      and has_function_privilege('authenticated', p.oid, 'execute');
  if n < 3 then raise exception 'A1 FAIL: confirm/admin/forfeit RPCs missing or not granted'; end if;
  raise notice 'A1 ok: confirm_match / admin_set_result / award_match_forfeit present + granted';

  -- A2. The shared finalizer exists but is NOT callable via the API roles.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'vik_finalize_match';
  if n < 1 then raise exception 'A2 FAIL: vik_finalize_match missing'; end if;
  if has_function_privilege('authenticated',
      (select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'vik_finalize_match' limit 1), 'execute') then
    raise exception 'A2 FAIL: vik_finalize_match is directly callable';
  end if;
  if has_function_privilege('anon',
      (select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'vik_finalize_match' limit 1), 'execute') then
    raise exception 'A2 FAIL: vik_finalize_match callable by anon';
  end if;
  raise notice 'A2 ok: vik_finalize_match hidden from API roles';

  -- A3. XP idempotency guard exists: unique (player, ref_type, ref_id, reason).
  select count(*) into n from pg_constraint
    where conname = 'xp_ledger_player_id_ref_type_ref_id_reason_key';
  if n < 1 then raise exception 'A3 FAIL: xp_ledger idempotency constraint missing'; end if;
  raise notice 'A3 ok: xp_ledger unique (player, ref, reason) present';

  -- A4. Return types: boolean purge flag on all three wrappers.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname in (
      'confirm_match','admin_set_result','award_match_forfeit')
      and pg_get_function_result(p.oid) = 'boolean';
  if n < 3 then raise exception 'A4 FAIL: wrappers must return boolean purge flag'; end if;
  raise notice 'A4 ok: all three wrappers return boolean';

  raise notice 'PART A COMPLETE: all automated 0035 assertions passed.';
end $$;

-- ================= PART B: manual acceptance proofs =================
-- Setup: two ACTIVE PLAYER users (A = submitter, B = opponent) + one ADMIN.
-- Get a RESULT_SUBMITTED match where A submitted and B has not confirmed.
-- Export JWTs: PLAYER_A_JWT, PLAYER_B_JWT, ADMIN_JWT, ANON_KEY, API as in 0034 tests.

-- B1. No double-award across two tabs (core acceptance).
--   Tab 1 + Tab 2 (both as B, same match): POST "$API/rpc/confirm_match"
--     -d '{"p_match_id":"<MID>"}' at the same time.
--   EXPECT: exactly one succeeds (boolean). The other gets
--     'Nothing to confirm.' AFTER the first commits (row lock serializes).
--   Verify (as service_role in SQL editor):
--     select player_id, reason from xp_ledger
--       where ref_type='match' and ref_id='<MID>';            -- exactly 2 rows
--     select count(*) from achievements
--       where competition_id='<CID>' and awarded_at > now() - interval '5 minutes';
--   Re-run confirm as B: EXPECT 'Nothing to confirm.', ledger unchanged.

-- B2. Tab-close still awards everything (core acceptance).
--   As B: send confirm_match, kill the request/client immediately (close tab,
--   airplane mode right after tapping Confirm).
--   EXPECT (checked in SQL editor afterwards): match CONFIRMED with winner_id,
--   2 xp_ledger rows, submitter notification present, round advanced if last.
--   The client only reads the boolean afterwards for the evidence purge.

-- B3. Purge flag behaviour.
--   Confirm the LAST open match of a round → returns true → app purges round
--     evidence (match_evidence rows for the round disappear within the sweep).
--   Confirm a mid-round match → returns false → evidence stays until round end.

-- B4. Staff paths share the finalizer.
--   As ADMIN on a RESULT_SUBMITTED/DISPUTED match:
--     POST "$API/rpc/admin_set_result"
--       -d '{"p_match_id":"<MID>","p_score_a":2,"p_score_b":2,"p_reason":"check"}'
--     EXPECT: true/false flag; match CONFIRMED 2–2; 2 xp rows (both match-draw 15);
--     audit_logs has ADMIN_CHANGED_MATCH_RESULT with actor = admin.
--   As ADMIN: POST "$API/rpc/award_match_forfeit"
--       -d '{"p_match_id":"<MID2>","p_winner_id":"<WINNER>"}'
--     EXPECT: FORFEIT 3–0 oriented to winner; audit ADMIN_AWARDED_FORFEIT;
--     loser has forfeit_player_id set; forfeit_claimed_by cleared.
--   As PLAYER B: both staff RPCs EXPECT 'Only staff ...' errors.

-- B5. Validation parity with the old client.
--   As A (submitter): confirm_match EXPECT
--     'The submitter cannot confirm their own result — opponent must confirm.'
--   As B with a pending forfeit claim: EXPECT 'Forfeit claim pending moderator review.'
--   As a random third player C: EXPECT 'Only the opponent can confirm.'
--   admin_set_result with -1 score: EXPECT 'Scores must be whole numbers >= 0.'
--   award_match_forfeit with a non-participant winner: EXPECT 'Winner must be a participant.'

-- B6. Streaks now count matches AND battles.
--   A player with 4 match wins + 1 battle win confirms a 5th (match) win:
--   EXPECT STREAK_5 awarded once. Re-confirm flows never duplicate it
--   (checked via achievements type per player).
