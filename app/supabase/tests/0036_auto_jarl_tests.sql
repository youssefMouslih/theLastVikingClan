-- VIK Clan 0036 tests: Auto-Jarl background automation.
-- Run AFTER 0036_auto_jarl.sql in Supabase SQL editor.
--
-- PART A (automated, runs here): catalog assertions. Raises on failure.
-- PART B (manual): the acceptance proof — with no client open, an overdue
-- match flips and warnings exist — plus per-feature checks.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
begin
  -- A1. pg_cron present and the 15-min job registered.
  select count(*) into n from pg_extension where extname = 'pg_cron';
  if n < 1 then raise exception 'A1 FAIL: pg_cron extension missing'; end if;
  select count(*) into n from cron.job
    where jobname = 'vik-auto-jarl' and schedule = '*/15 * * * *' and active;
  if n < 1 then raise exception 'A1 FAIL: vik-auto-jarl not scheduled */15'; end if;
  raise notice 'A1 ok: pg_cron + vik-auto-jarl every 15 min';

  -- A2. run_auto_jarl is SECURITY DEFINER and hidden from API roles.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'run_auto_jarl' and p.prosecdef = true;
  if n < 1 then raise exception 'A2 FAIL: run_auto_jarl missing/not definer'; end if;
  if has_function_privilege('authenticated',
      (select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'run_auto_jarl' limit 1), 'execute') then
    raise exception 'A2 FAIL: run_auto_jarl callable via anon key';
  end if;
  raise notice 'A2 ok: run_auto_jarl definer-only';

  -- A3. Settings columns exist with safe defaults.
  select count(*) into n from information_schema.columns
    where table_schema = 'public' and table_name = 'clan_settings'
      and column_name in ('auto_jarl_enabled','auto_confirm_hours',
        'overdue_grace_hours','forfeit_mode');
  if n < 4 then raise exception 'A3 FAIL: jarl settings columns missing'; end if;
  raise notice 'A3 ok: 4 jarl settings columns present';

  -- A4. Reminder markers table exists, RLS on, server-only (no policies).
  select count(*) into n from information_schema.tables
    where table_schema = 'public' and table_name = 'match_reminders';
  if n < 1 then raise exception 'A4 FAIL: match_reminders missing'; end if;
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'match_reminders';
  if n > 0 then raise exception 'A4 FAIL: match_reminders must stay server-only'; end if;
  raise notice 'A4 ok: match_reminders server-only';

  -- A5. Cron path kept working: guard allows null-uid (server) updates.
  -- (Proven live in B1; here assert the function body contains the bypass.)
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'guard_match_update'
      and pg_get_functiondef(p.oid) like '%if me is null then%return NEW;%';
  if n < 1 then raise exception 'A5 FAIL: matches guard lacks cron bypass'; end if;
  raise notice 'A5 ok: matches guard has server-side bypass';

  raise notice 'PART A COMPLETE: all automated 0036 assertions passed.';
end $$;

-- ================= PART B: manual acceptance proofs =================
-- B1. CORE ACCEPTANCE — nobody opens the app.
--   1. In SQL editor (service role), pick a test competition and insert:
--        insert into matches (competition_id, player_a_id, player_b_id,
--          status, scheduled_at, deadline)
--        values ('<CID>','<A>','<B>','SCHEDULED', now(), now() - interval '1 hour');
--   2. Close everything. Either wait ≤15 min for cron, or run:
--        select public.run_auto_jarl();   -- returns counts jsonb
--   3. EXPECT: match status = OVERDUE, and both players have a MATCH_OVERDUE
--      notification (notifications table, entity match/<MID>).
--      select status from matches where id = '<MID>';                       -- OVERDUE
--      select user_id, type from notifications where entity_id = '<MID>';  -- 2 rows
--   4. Re-run run_auto_jarl(): EXPECT no duplicate MATCH_OVERDUE rows
--      (the status flip is the sent-once gate).

-- B2. Warnings 24h + 3h, once each.
--   Insert a SCHEDULED match with deadline = now() + 2 hours.
--   Run the jarl. EXPECT: match_reminders row with both markers set, and each
--   player got exactly one 'Deadline in 24 hours' + one 'Deadline in 3 hours'.
--   Re-run: EXPECT zero new warnings.

-- B3. Silent auto-confirm (needs evidence + 48h silence by default).
--   Submit a result as A (app or SQL), attach one match_evidence row,
--   backdate submitted_at > auto_confirm_hours ago via SQL editor:
--     update matches set submitted_at = now() - interval '49 hours' where id='<MID>';
--   Set forfeit_mode='manual' (default) so step 4 cannot interfere.
--   Run the jarl. EXPECT: CONFIRMED, 2 xp_ledger rows (match ref), FIRST_BLOOD
--   if applicable, AUTO_CONFIRMED audit row, submitter + opponent notified.

-- B4. Forfeit rule in auto mode (set forfeit_mode='auto' in Admin > Access).
--   a) SCHEDULED match, deadline > grace ago, no submissions:
--      EXPECT CANCELLED + both notified, zero xp_ledger rows for the match.
--   b) RESULT_SUBMITTED (A submitted, B silent) past grace:
--      EXPECT FORFEIT 3–0 to A, AUTO_FORFEIT audit, loser notified.
--   c) Reset forfeit_mode='manual' afterwards (default): repeat (a) setup,
--      EXPECT the match stays OVERDUE untouched (moderators decide in app).

-- B5. Auto-finish.
--   ACTIVE competition with end_date past + all matches final: EXPECT FINISHED
--   after a run. One open match: EXPECT stays ACTIVE (same as before).

-- B6. Waitlist offers.
--   REGISTRATION_OPEN competition with a free slot + a WAITING row:
--   EXPECT the head row -> OFFERED with expires_at ≈ +24h + WAITLIST_AVAILABLE
--   to that player. Backdate expires_at past, re-run: EXPECT EXPIRED and the
--   next WAITING row OFFERED + notified. Join as the offered player in the app:
--   EXPECT the row flips to ACCEPTED on the next run.

-- B7. Kill switch + tuning (Admin > Access, no SQL needed).
--   Toggle Auto-Jarl off: run_auto_jarl() EXPECT '{"enabled": false}' and no
--   state changes. Set auto_confirm_hours = 1: a 2h-silent submission
--   EXPECT auto-confirms on next run. Restore defaults (on / 48 / 48 / manual).

-- B8. Regression: with the jarl enabled, the normal app flows still work —
--   submit → opponent confirm in-app (instant, no waiting for cron);
--   CompetitionDetail view still sweeps overdue as a fallback.
