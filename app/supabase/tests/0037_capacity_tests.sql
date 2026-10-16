-- VIK Clan 0037 tests: server-side capacity + balances.
-- Run AFTER 0037_capacity_balances.sql in Supabase SQL editor.
--
-- PART A (automated, runs here): catalog assertions. Raises on failure.
-- PART B (manual): the two acceptance races + validation parity.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
begin
  -- A1. join/leave RPCs exist, SECURITY DEFINER, granted to authenticated.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname in ('join_competition','leave_competition')
      and p.prosecdef = true
      and has_function_privilege('authenticated', p.oid, 'execute');
  if n < 2 then raise exception 'A1 FAIL: join/leave RPCs missing or not granted'; end if;
  raise notice 'A1 ok: join_competition / leave_competition present + granted';

  -- A2. No member INSERT/DELETE left on competition_participants (staff ALL only).
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'competition_participants'
      and cmd in ('INSERT','DELETE') and policyname not like '%admins manage%';
  if n > 0 then raise exception 'A2 FAIL: member write policy still on participants'; end if;
  raise notice 'A2 ok: participants writable only via RPC (+ staff replacements)';

  -- A3. No member UPDATE on gp_requests (answers go through answer_gift RPC).
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'gp_requests'
      and cmd = 'UPDATE' and policyname not like '%admins manage%';
  if n > 0 then raise exception 'A3 FAIL: member UPDATE still on gp_requests'; end if;
  raise notice 'A3 ok: gifts answerable only via answer_gift RPC (+ staff)';

  -- A4. answer_gift serializes: request row + giver profile row locked.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'answer_gift'
      and pg_get_functiondef(p.oid) like '%for update%';
  if n < 1 then raise exception 'A4 FAIL: answer_gift lacks row locks'; end if;
  raise notice 'A4 ok: answer_gift locks request + giver rows';

  -- A5. join_competition locks the competition row (last-slot race safe).
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'join_competition'
      and pg_get_functiondef(p.oid) like '%for update%';
  if n < 1 then raise exception 'A5 FAIL: join_competition lacks row lock'; end if;
  raise notice 'A5 ok: join_competition serializes on the competition row';

  -- A6. Forced-call 100 GP gate lives server-side (BEFORE INSERT trigger).
  select count(*) into n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'challenges'
      and t.tgname = 'challenges_insert_guard';
  if n < 1 then raise exception 'A6 FAIL: challenge insert guard missing'; end if;
  raise notice 'A6 ok: forced-call balance enforced by trigger';

  raise notice 'PART A COMPLETE: all automated 0037 assertions passed.';
end $$;

-- ================= PART B: manual acceptance proofs =================
-- Setup: REGISTRATION_OPEN competition with max_players = N and N-1
-- participants (one slot left). Two ACTIVE oath-sworn PLAYERs: A and B.
-- Export PLAYER_A_JWT, PLAYER_B_JWT, ANON_KEY, API as in 0034 tests.

-- B1. CORE: two simultaneous joins on the last slot.
--   Fire at once (two shells / Promise.all in devtools):
--     POST "$API/rpc/join_competition" -d '{"p_code":"<CODE>"}' as A and as B.
--   EXPECT: exactly one returns {"ok":true,...}; the other returns
--     {"ok":false,"code":"COMPETITION_FULL",...} (HTTP 200, coded payload).
--   Verify: select count(*) from competition_participants
--     where competition_id='<CID>';   -- exactly N, never N+1.
--   In the app the loser sees the full message and gets the waitlist button.

-- B2. CORE: double-click Accept gift transfers once.
--   Giver G (balance B >= amount), requester R, PENDING request <RID>.
--   Fire twice at once as G: POST "$API/rpc/answer_gift"
--     -d '{"p_request_id":"<RID>","p_accept":true}'.
--   EXPECT: one succeeds; the other gets 'Already answered.'.
--   Verify: select * from xp_ledger where ref_type='gift' and ref_id='<RID>';
--     -- exactly 2 rows (-amount gift-sent, +amount gift-received, shared ref).
--     select coalesce(sum(amount),0) from xp_ledger where player_id='<G>';
--     -- equals B - amount (never negative, never double-charged).

-- B3. Leave rules.
--   As a participant of a REGISTRATION_OPEN competition:
--     POST "$API/rpc/leave_competition" -d '{"p_competition_id":"<CID>"}'
--     EXPECT {"ok":true}. Re-run EXPECT 'You are not registered...'.
--   As a participant of an ACTIVE competition: EXPECT
--     'This competition has started — ask a moderator to replace you.'
--   Direct DELETE via REST as the player:
--     DELETE "$API/competition_participants?competition_id=eq.<CID>&player_id=eq.<ME>"
--     EXPECT RLS deny (member policies revoked).

-- B4. Join validation parity (same messages as the old client).
--   Suspended user / oath-less user: EXPECT 'Only ACTIVE...' / oath message.
--   Wrong code: EXPECT 'Competition not found.'
--   Closed / full-window: EXPECT 'Registration is closed...'.
--   Already joined: EXPECT 'You are already registered...'.
--   Direct INSERT via REST as the player: EXPECT RLS deny.

-- B5. Forced-call gate (no new code; verify the 0034 trigger through REST).
--   As a player holding < 100 GP, POST "$API/challenges" with
--   forced=true, type HEAD, opponent = another member:
--   EXPECT 4xx 'Unrefusable calls require holding 100 GP.'.
