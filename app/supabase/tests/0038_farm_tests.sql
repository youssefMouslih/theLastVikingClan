-- VIK Clan 0038 tests: anti-farming caps.
-- Run AFTER 0038_farm_caps.sql in Supabase SQL editor.
-- Pure-TS coverage for the rival rule lives in
-- app/src/services/sagaQuests.test.ts (8 cases, runs in npm run check).
--
-- PART A (automated, runs here): catalog assertions. Raises on failure.
-- PART B (manual): the 10-friendlies acceptance script + bounty + rival.

-- ================= PART A: automated assertions =================
do $$
declare
  n int;
begin
  -- A1. Cap tunables exist on clan_settings.
  select count(*) into n from information_schema.columns
    where table_schema = 'public' and table_name = 'clan_settings'
      and column_name in ('xp_pair_cap_per_day','xp_friendly_cap_per_day');
  if n < 2 then raise exception 'A1 FAIL: cap columns missing'; end if;
  raise notice 'A1 ok: xp_pair_cap_per_day / xp_friendly_cap_per_day present';

  -- A2. challenges.xp_capped exists for the battle-card note.
  select count(*) into n from information_schema.columns
    where table_schema = 'public' and table_name = 'challenges'
      and column_name = 'xp_capped';
  if n < 1 then raise exception 'A2 FAIL: challenges.xp_capped missing'; end if;
  raise notice 'A2 ok: challenges.xp_capped present';

  -- A3. grant_battle_rewards enforces caps and transfers (not mints) bounty.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'grant_battle_rewards'
      and pg_get_functiondef(p.oid) like '%xp_pair_cap_per_day%'
      and pg_get_functiondef(p.oid) like '%bounty-paid%';
  if n < 1 then raise exception 'A3 FAIL: battle rewards lack caps/bounty transfer'; end if;
  raise notice 'A3 ok: pair+friendly caps + bounty debit in grant_battle_rewards';

  -- A4. claim_quest rival branch requires a new weekly opponent.
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'claim_quest'
      and pg_get_functiondef(p.oid) like '%v_prev%';
  if n < 1 then raise exception 'A4 FAIL: rival rule lacks previous-week check'; end if;
  raise notice 'A4 ok: rival quest checks the previous week';

  raise notice 'PART A COMPLETE: all automated 0038 assertions passed.';
end $$;

-- ================= PART B: manual acceptance proofs =================
-- Setup: two ACTIVE PLAYERs A and B with 0 recent battle XP. Note their
-- balances: select player_id, sum(amount) from xp_ledger
--   where player_id in ('<A>','<B>') group by 1;

-- B1. CORE ACCEPTANCE — 10 friendlies pay only up to the cap.
--   Complete 10 FRIENDLY battles A-vs-B today (app flow: issue, accept,
--   submit, confirm — alternating submitters to also prove both sides).
--   After each confirm, check:
--     select ref_id, player_id, amount, reason from xp_ledger
--       where ref_type='battle' order by created_at desc limit 4;
--   EXPECT with defaults (pair 3, friendly 2):
--     battles 1–2: both earn (25/15/10 by result);
--     battle 3: NEITHER earns (pair cap reached at 3 — wait, pair cap counts
--       battles where BOTH earned: after battles 1–2 both earned twice, so
--       pair_today=2 < 3 → battle 3 still pays IF friendly caps allow; but
--       each player's friendly count is already 2 → friendly-capped at 3).
--     Precisely: friendlies 1–2 pay both; friendlies 3–10 pay NOBODY, and
--     each of battles 3–10 stamps challenges.xp_capped = true (battle card
--     shows the note). Total minted battle XP for the pair = 2 battles only.
--   Mixed check: make battles 1–2 HONOR instead of FRIENDLY: EXPECT battle 3
--   (friendly) pays (friendly count 0), battle 4+ pay nobody (pair cap 3 hit:
--   battles 1,2,3 both earned → pair_today=3).

-- B2. Bounty is a transfer, never minted.
--   Challenger C (balance Cb >= 100) issues a FORCED head call vs D, D wins.
--   EXPECT: C has a -100 'bounty-paid' row, D has +100 'bounty', same ref_id;
--     select sum(amount) ... where ref_id='<BATTLE>' → 0 (zero-sum).
--   Repeat with C holding only 40 GP at completion (gift most away first):
--     EXPECT transfer of exactly 40 (least(100, balance)), never negative.
--   With C at 0: EXPECT no bounty rows at all (amt 0 skipped, no check error).

-- B3. Rival quest needs a new opponent weekly.
--   Week 1: complete a REMATCH A-vs-B, claim 'rival' as A → EXPECT success.
--   Week 2 (next Monday): complete another REMATCH A-vs-B, claim → EXPECT
--     'Quest not complete yet.'. Complete REMATCH A-vs-C instead, claim →
--     EXPECT success. (Client quest board mirrors this via
--     rivalQuestQualifies — progress shows 0/1 until the new opponent.)

-- B4. Competition matches stay exempt.
--   Confirm 5 league matches in one day: EXPECT full XP every time
--   (vik_finalize_match untouched — no caps on the match path).

-- B5. Cap tuning (SQL, no UI by design).
--   update clan_settings set xp_pair_cap_per_day = 5;
--   EXPECT the next pair battle pays again. Restore to 3 afterwards.
