-- VIK Clan 0039 tests: account-level gaps (5 items).
-- Run AFTER 0039_account_gaps.sql in Supabase SQL editor.
-- Deploy first: supabase functions deploy accept-tryout (flag lives in Edge).
--
-- PART A (automated, runs here): catalog assertions. Raises on failure.
-- PART B (manual): one checklist per item.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
begin
  -- A1. Forced-rotation flag exists.
  select count(*) into n from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'must_change_password';
  if n < 1 then raise exception 'A1 FAIL: profiles.must_change_password missing'; end if;
  raise notice 'A1 ok: must_change_password present';

  -- A2. Tryout honeypot column + policy gate + guard trigger.
  select count(*) into n from information_schema.columns
    where table_schema = 'public' and table_name = 'tryout_requests'
      and column_name = 'website_url';
  if n < 1 then raise exception 'A2 FAIL: website_url missing'; end if;
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'tryout_requests'
      and policyname = 'anon submit tryout' and with_check like '%website_url%';
  if n < 1 then raise exception 'A2 FAIL: anon policy ignores honeypot'; end if;
  select count(*) into n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'tryout_requests'
      and t.tgname = 'tryout_insert_guard';
  if n < 1 then raise exception 'A2 FAIL: tryout_insert_guard missing'; end if;
  raise notice 'A2 ok: honeypot column + policy + rate/dedupe trigger';

  -- A3. transfer_ownership is definer + callable by authenticated (self-guards OWNER).
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'transfer_ownership'
      and p.prosecdef = true
      and has_function_privilege('authenticated', p.oid, 'execute');
  if n < 1 then raise exception 'A3 FAIL: transfer_ownership missing/not granted'; end if;
  raise notice 'A3 ok: transfer_ownership present + granted';

  -- A4. Ratings require shared confirmed history (both write policies).
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'ratings'
      and policyname in ('members rate','members update own rating')
      and with_check like '%CONFIRMED%' and with_check like '%COMPLETED%';
  if n < 2 then raise exception 'A4 FAIL: ratings lack shared-history gate'; end if;
  raise notice 'A4 ok: ratings gated on shared matches/battles';

  raise notice 'PART A COMPLETE: all automated 0039 assertions passed.';
end $$;

-- ================= PART B: manual checklist (one per item) =================
-- B1. Forced rotation.
--   1. Admin > Tryouts: accept a tryout (Edge deployed) → temp password shown.
--      Verify flag: select must_change_password from profiles where id='<NEW>';
--      EXPECT true.
--   2. Log in as the new account with the temp password → EXPECT instant
--      redirect to /password; typing /home, /competitions, /admin manually
--      bounces back to /password; no clan content is reachable.
--   3. Set a new password (mismatch + <6 chars show localized errors) →
--      EXPECT land on /home, flag cleared:
--      select must_change_password ... → false. Old temp password dead.
--   4. Regression: normal accounts (flag false) never see /password.

-- B2. Password-reset recovery screen.
--   1. /login → Forgot password → send link (check inbox).
--   2. Click the link → EXPECT the app opens /login in 'Choose a new
--      password' mode (not a plain login form).
--   3. Set + confirm mismatch → localized error; success → EXPECT /home
--      logged in with the new password. Old password dead.

-- B3. Tryout spam protection.
--   1. Honeypot: submit the tryout form with the hidden field filled (devtools
--      → remove the off-screen style, type anything) → EXPECT fake success,
--      zero rows: select * from tryout_requests where contact='<X>'; → none.
--      Direct REST with website_url='x' → EXPECT RLS deny.
--   2. Rate limit: submit 4 requests with 4 different emails but the SAME
--      contact within minutes → EXPECT the 4th fails
--      'Too many requests from this contact…'.
--   3. Dedupe: submit, then submit again same contact (or same email, different
--      case) while PENDING → EXPECT 'already have a pending request'.
--      Admin declines the first → resubmit EXPECT success.

-- B4. Owner transfer (exactly one OWNER, always).
--   1. Pre-check: select username, role from profiles where role='OWNER';
--      EXPECT exactly 1 row.
--   2. As OWNER, Admin > Members: transfer card visible ONLY for OWNER
--      (login as ADMIN → no card). Pick an ACTIVE ADMIN, type a WRONG
--      confirmation → button stays disabled; call the RPC directly with wrong
--      text → EXPECT 'Confirmation does not match…'.
--   3. Type the exact username → confirm → EXPECT 'Ownership transferred.',
--      old owner is now ADMIN (re-login: no Admin grants, no transfer card),
--      new owner is OWNER. Count again → exactly 1 OWNER, different person.
--   4. As ADMIN (ex-owner): RPC call → EXPECT 'Only the owner…'.
--      Target a PLAYER (not ADMIN) → EXPECT 'must be an ACTIVE ADMIN.'.
--   5. Audit: select * from audit_logs where action='ADMIN_TRANSFERRED_OWNERSHIP'
--      order by created_at desc limit 1; → actor = ex-owner, entity = new owner.

-- B5. Ratings need shared history.
--   1. As A, rate C (no shared confirmed match/battle) in Profile →
--      EXPECT 'You can only rate warriors you have faced…', no row written.
--   2. Complete a match/battle A-vs-C (confirm both sides), rate again →
--      EXPECT success. Update the rating → EXPECT success (history persists).
--   3. Direct REST upsert for a stranger → EXPECT RLS deny.
