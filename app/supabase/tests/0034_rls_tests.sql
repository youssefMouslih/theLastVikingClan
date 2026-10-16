-- VIK Clan 0034 RLS tests: prove a normal user cannot cheat.
-- Run AFTER 0034_rls_cheat_lockdown.sql in Supabase SQL editor.
--
-- PART A (automated, runs here): catalog assertions. Every block raises on
-- failure; success prints one NOTICE per check. All must pass.
-- PART B (manual, needs two JWTs): REST cheat checklist with curl. Each item
-- states the expected denial. Tick them off after running 0034 on the project.

-- ================= PART A: automated policy/trigger/RPC assertions =================
do $$
declare
  n int;
begin
  -- A1. No direct INSERT on the economy tables for authenticated.
  select count(*) into n from pg_policies
    where schemaname = 'public' and cmd = 'INSERT'
      and tablename in ('xp_ledger','quest_claims')
      and (roles::text like '%authenticated%' or roles::text like '%public%');
  if n > 0 then raise exception 'A1 FAIL: % open INSERT policies on xp/claims', n; end if;
  raise notice 'A1 ok: no member INSERT on xp_ledger / quest_claims';

  -- A2. No member UPDATE left on gp_requests (answers go through the RPC).
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'gp_requests'
      and cmd = 'UPDATE' and policyname not like '%admins manage%';
  if n > 0 then raise exception 'A2 FAIL: member UPDATE still on gp_requests'; end if;
  raise notice 'A2 ok: gifts answerable only via answer_gift RPC (+ staff)';

  -- A3. Guard triggers exist on all cheat-path tables.
  select count(*) into n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and t.tgname in (
      'profiles_guard','matches_guard','challenges_insert_guard','challenges_guard',
      'squad_members_guard','tryout_verdict_guard','waitlist_position');
  if n < 7 then raise exception 'A3 FAIL: only % of 7 guard triggers present', n; end if;
  raise notice 'A3 ok: all 7 guard triggers present';

  -- A4. Economy/throne RPCs exist, are SECURITY DEFINER, executable by authenticated only.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname in (
      'grant_match_rewards','grant_battle_rewards','claim_quest',
      'answer_gift','claim_onboarding_reward','settle_throne_battle')
      and p.prosecdef = true;
  if n < 6 then raise exception 'A4 FAIL: only % of 6 RPCs are security definer', n; end if;
  raise notice 'A4 ok: 6 economy RPCs present and SECURITY DEFINER';

  -- A5. Player match/challenge UPDATE policies carry WITH CHECK (no silent escalation).
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'matches'
      and policyname = 'players submit own matches' and with_check is not null;
  if n < 1 then raise exception 'A5 FAIL: matches player policy lacks WITH CHECK'; end if;
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'ratings'
      and policyname = 'members update own rating' and with_check is not null;
  if n < 1 then raise exception 'A5 FAIL: ratings policy lacks WITH CHECK'; end if;
  raise notice 'A5 ok: player UPDATE policies have WITH CHECK';

  -- A6. Audit append is actor-scoped.
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
      and cmd = 'INSERT' and with_check is not null
      and with_check like '%auth.uid()%';
  if n < 1 then raise exception 'A6 FAIL: audit INSERT not actor-scoped'; end if;
  raise notice 'A6 ok: audit append requires actor_id = self';

  -- A7. Avatar storage writes are owner-folder scoped (no more any-path FOR ALL).
  select count(*) into n from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'members manage own avatar';
  if n > 0 then raise exception 'A7 FAIL: old any-path avatar policy still exists'; end if;
  select count(*) into n from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'members % own avatar%' and with_check like '%foldername%';
  if n < 2 then raise exception 'A7 FAIL: owner-scoped avatar write policies missing'; end if;
  raise notice 'A7 ok: avatar writes are owner-folder scoped';

  -- A8. Ratings score/dims consistency constraint exists.
  select count(*) into n from pg_constraint
    where conname = 'ratings_score_dims_check';
  if n < 1 then raise exception 'A8 FAIL: ratings_score_dims_check missing'; end if;
  raise notice 'A8 ok: ratings score/dims consistency enforced';

  raise notice 'PART A COMPLETE: all automated 0034 assertions passed.';
end $$;

-- ================= PART B: manual JWT cheat checklist =================
-- Setup: in Supabase Auth, pick two ACTIVE PLAYER users. Mint/obtain their
-- access JWTs (login via the app, copy from devtools network, or use
-- Dashboard > Authentication > user > "Sign in as user" if enabled).
-- Export them in your shell:
--   export PLAYER_A_JWT=<jwt of player A>   -- participant / attacker
--   export PLAYER_B_JWT=<jwt of player B>   -- victim / opponent
--   export ANON_KEY=<project anon key>
--   export API=https://<project-ref>.supabase.co/rest/v1
-- Every B-item must FAIL (4xx or trigger error) for the attacker and keep
-- working for the legitimate flow named in parentheses.

-- B1. Mint Glory directly (must fail: RLS deny, no INSERT policy).
-- curl -s -X POST "$API/xp_ledger" -H "apikey: $ANON_KEY" \
--   -H "Authorization: Bearer $PLAYER_A_JWT" -H "Content-Type: application/json" \
--   -d '{"player_id":"<A-UUID>","amount":999999,"reason":"match-win","ref_type":"match","ref_id":"x","season":"S2026"}'
-- EXPECT: 401/403 or {"message":"new row violates row-level security"}.

-- B2. Claim a quest without earning it (must fail: no INSERT policy).
-- curl -s -X POST "$API/quest_claims" ... -d '{"player_id":"<A-UUID>","quest_key":"veteran","period":"2099-01-01"}'
-- EXPECT: RLS deny. (Legit flow: Saga > claim button calls claim_quest RPC.)

-- B3. Self-confirm a match (must fail: trigger "submitter cannot confirm").
-- As A: PATCH "$API/matches?id=eq.<RESULT_SUBMITTED-BY-A>" \
--   -d '{"status":"CONFIRMED","confirmed_by":"<A-UUID>","confirmed_at":"now()"}'
-- EXPECT: 4xx trigger error. (Legit: opponent taps Confirm in the app.)

-- B4. Forge winner/score on confirm (must fail: scores immutable on confirm).
-- As B on a RESULT_SUBMITTED match: PATCH ... -d '{"status":"CONFIRMED","score_a":9,"score_b":0,...}'
-- EXPECT: 4xx "Scores cannot change on confirm". (Legit: confirm keeps scores.)

-- B5. Escalate to OWNER (must fail: trigger).
-- As A: PATCH "$API/profiles?id=eq.<A-UUID>" -d '{"role":"OWNER"}'
-- EXPECT: 4xx "Only staff can change role...". (Legit: oath/profile edits still work —
--   PATCH display_name/whatsapp/known_name as A must SUCCEED.)

-- B6. Join a competition while SUSPENDED/oath-less (must fail: WITH CHECK).
-- (Set A SUSPENDED via Admin first, then revert.) POST "$API/competition_participants"
--   -d '{"competition_id":"...","player_id":"<A-UUID>"}'  EXPECT: RLS deny.

-- B7. Jump the waitlist (position ignored, server assigns max+1).
-- POST "$API/competition_waitlist" -d '{"competition_id":"...","player_id":"<A-UUID>","position":1}'
-- EXPECT: row created with position = max+1, NOT 1. Verify via GET.

-- B8. Complete someone else's battle (must fail: trigger).
-- As A on B's RESULT_SUBMITTED battle: PATCH "$API/challenges?id=eq.<ID>" -d '{"status":"COMPLETED"}'
-- EXPECT: 4xx. (Legit: the other side confirms in Arena.)

-- B9. Decline a forced 100 GP call (must fail: trigger).
-- As the forced opponent: PATCH ... -d '{"status":"DECLINED"}'  EXPECT: 4xx.
-- (Legit: Accept works; forced without 100 GP balance fails at issue.)

-- B10. Accept a gift without paying (must fail: no UPDATE policy).
-- As giver G: PATCH "$API/gp_requests?id=eq.<PENDING>" -d '{"status":"ACCEPTED"}'
-- EXPECT: RLS deny. (Legit: Saga > Gifts > Accept calls answer_gift RPC and moves GP.)

-- B11. Tester resolves a tryout (must fail: trigger).
-- As assigned tester T: PATCH "$API/tryout_requests?id=eq.<ID>" -d '{"status":"ACCEPTED"}'
-- EXPECT: 4xx "Testers can only report the verdict". (Legit: verdict + scores save works.)

-- B12. Overwrite someone else's avatar (must fail: storage policy).
-- Upload to avatars/<B-UUID>/avatar.png with A's JWT. EXPECT: 4xx RLS.
-- (Legit: own avatar/banner upload still works from Profile.)

-- B13. Reassign a rating (must fail: WITH CHECK).
-- As A on own rating row: PATCH "$API/ratings?rater_id=eq.<A>" -d '{"rater_id":"<B-UUID>"}'
-- EXPECT: RLS deny. (Legit: rating someone 1-5 + dims still works.)

-- B14. Spoof audit as another admin (must fail: actor check).
-- POST "$API/audit_logs" -d '{"actor_id":"<OTHER>","action":"X","entity_type":"t","entity_id":null}'
-- EXPECT: RLS deny. (Legit: admin actions still append as self.)

-- B15. Regression sweep (must SUCCEED after 0034):
--   submit result + opponent confirm on a test match; open-mat issue/accept;
--   quest claim button with real progress; gift ask/accept moving GP;
--   onboarding gate +80 for a fresh test user; throne pledge settle on a
--   throne battle; overdue flip on an expired fixture; admin dispute resolve.
