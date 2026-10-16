-- VIK Clan migration 0038: stop XP farming between friends.
-- Run AFTER 0037. Idempotent: IF NOT EXISTS / OR REPLACE throughout.
--
-- grant_battle_rewards, re-stated:
--  1. Per-pair daily cap (default 3): the same two warriors earn battle XP
--     together at most N times per Casa day. Competition matches are exempt
--     (fixtures are finite) — only reason='battle' ledger rows count.
--  2. Friendly cap (default 2): FRIENDLY battles pay XP for the first M per
--     day per player; the other duelist still earns unless also capped.
--  3. Forced bounty is now a TRANSFER: min(100, challenger balance) debited
--     from the challenger ('bounty-paid') and credited to the winner
--     ('bounty'). Nothing is minted; a broke challenger pays nothing.
--  4. challenges.xp_capped is stamped true whenever a cap bit, so the battle
--     card can show the note (never reset — the note reflects award time).
-- claim_quest, re-stated: the 'rival' weekly quest counts only REMATCHes
--   against member opponents NOT faced in a rematch during the previous Casa
--   week — farming the same friend every week stops paying after week one.
-- Tunables live on clan_settings (xp_pair_cap_per_day, xp_friendly_cap_per_day).

alter table public.clan_settings
  add column if not exists xp_pair_cap_per_day int not null default 3,
  add column if not exists xp_friendly_cap_per_day int not null default 2;
do $$ begin
  alter table public.clan_settings add check (xp_pair_cap_per_day >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clan_settings add check (xp_friendly_cap_per_day >= 0);
exception when duplicate_object then null; end $$;

alter table public.challenges
  add column if not exists xp_capped boolean not null default false;

-- ============ battle rewards with caps + transferred bounty ============
create or replace function public.grant_battle_rewards(p_challenge_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  s record;
  a_won boolean; is_draw boolean;
  opp uuid;
  winner uuid;
  v_day timestamptz := date_trunc('day', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
  pair_cap int := 3;
  friendly_cap int := 2;
  pair_today int := 0;
  f_today int := 0;
  pair_capped boolean := false;
  chal_capped boolean := false;
  opp_capped boolean := false;
  bal int := 0;
  amt int := 0;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if c is null then raise exception 'Battle not found.'; end if;
  if c.status != 'COMPLETED' then raise exception 'Battle is not final.'; end if;
  if auth.uid() is distinct from c.challenger_id
    and (c.opponent_id is null or auth.uid() is distinct from c.opponent_id)
    and not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only participants can settle rewards.';
  end if;
  select * into s from public.clan_settings limit 1;
  if s is not null then
    pair_cap := coalesce(s.xp_pair_cap_per_day, 3);
    friendly_cap := coalesce(s.xp_friendly_cap_per_day, 2);
  end if;
  a_won := c.score_a > c.score_b;
  is_draw := c.score_a = c.score_b;
  opp := c.opponent_id;
  -- Per-pair daily cap: distinct battles (excluding this one) where BOTH
  -- duelists already earned battle XP today.
  if opp is not null then
    select count(*) into pair_today from (
      select l.ref_id from public.xp_ledger l
        where l.reason = 'battle' and l.ref_type = 'battle'
          and l.player_id in (c.challenger_id, opp)
          and l.created_at >= v_day
          and l.ref_id != c.id::text
      group by l.ref_id
      having count(distinct l.player_id) = 2
    ) s2;
    if pair_today >= pair_cap then
      pair_capped := true;
      chal_capped := true;
      opp_capped := true;
    end if;
  end if;
  -- Minted battle XP (winner 25 / draw 15 / loser 10), unless capped.
  if not pair_capped then
    if c.type = 'FRIENDLY' then
      select count(distinct l.ref_id) into f_today from public.xp_ledger l
        join public.challenges ch on ch.id::text = l.ref_id
        where l.reason = 'battle' and l.ref_type = 'battle'
          and l.player_id = c.challenger_id and ch.type = 'FRIENDLY'
          and l.created_at >= v_day and l.ref_id != c.id::text;
      if f_today >= friendly_cap then chal_capped := true; end if;
    end if;
    if not chal_capped then
      insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
        values (c.challenger_id, case when a_won then 25 when is_draw then 15 else 10 end,
          'battle', 'battle', c.id::text, public.vik_season())
        on conflict (player_id, ref_type, ref_id, reason) do nothing;
    end if;
    if opp is not null then
      if c.type = 'FRIENDLY' then
        select count(distinct l.ref_id) into f_today from public.xp_ledger l
          join public.challenges ch on ch.id::text = l.ref_id
          where l.reason = 'battle' and l.ref_type = 'battle'
            and l.player_id = opp and ch.type = 'FRIENDLY'
            and l.created_at >= v_day and l.ref_id != c.id::text;
        if f_today >= friendly_cap then opp_capped := true; end if;
      end if;
      if not opp_capped then
        insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
          values (opp, case when not a_won and not is_draw then 25 when is_draw then 15 else 10 end,
            'battle', 'battle', c.id::text, public.vik_season())
          on conflict (player_id, ref_type, ref_id, reason) do nothing;
      end if;
    end if;
  end if;
  if chal_capped or opp_capped then
    update public.challenges set xp_capped = true
      where id = c.id and xp_capped = false;
  end if;
  -- Forced bounty: TRANSFER from challenger to winner, capped at balance.
  if c.forced = true and not is_draw then
    winner := case when a_won then c.challenger_id else opp end;
    if winner is not null then
      select coalesce(sum(amount), 0) into bal from public.xp_ledger
        where player_id = c.challenger_id;
      amt := least(100, greatest(bal, 0));
      if amt > 0 then
        insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
          values (c.challenger_id, -amt, 'bounty-paid', 'battle', c.id::text, public.vik_season())
          on conflict (player_id, ref_type, ref_id, reason) do nothing;
        insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
          values (winner, amt, 'bounty', 'battle', c.id::text, public.vik_season())
          on conflict (player_id, ref_type, ref_id, reason) do nothing;
      end if;
    end if;
  end if;
end $$;
revoke all on function public.grant_battle_rewards(uuid) from public;
grant execute on function public.grant_battle_rewards(uuid) to authenticated;

-- ============ rival quest: a new opponent every week ============
create or replace function public.claim_quest(p_quest_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  daily text[] := array['first-blood','wanderer','caller','squire'];
  weekly text[] := array['veteran','rival'];
  kind text;
  xp int;
  v_day timestamptz := date_trunc('day', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
  v_week timestamptz := date_trunc('week', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
  v_prev timestamptz := (date_trunc('week', now() at time zone 'Africa/Casablanca') - interval '7 days') at time zone 'Africa/Casablanca';
  since timestamptz;
  period text;
  done int := 0; target int := 1;
begin
  if p_quest_key = any(daily) then kind := 'daily';
  elsif p_quest_key = any(weekly) then kind := 'weekly';
  else raise exception 'Unknown quest.'; end if;
  if kind = 'daily' then
    since := v_day; period := (v_day at time zone 'Africa/Casablanca')::date::text;
  else
    since := v_week; period := (v_week at time zone 'Africa/Casablanca')::date::text;
  end if;
  case p_quest_key
    when 'first-blood' then xp := 30; target := 1;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since;
      done := least(done, 1);
    when 'wanderer' then xp := 60; target := 2;
      select count(*) into done from (
        select distinct case when player_a_id = me then player_b_id else player_a_id end
        from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since
      ) s;
      done := least(done, 2);
    when 'caller' then xp := 15; target := 1;
      select count(*) into done from public.challenges
        where challenger_id = me and created_at >= since;
      done := least(done, 1);
    when 'squire' then xp := 20; target := 1;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT')
          and confirmed_by = me and confirmed_at >= since;
      done := least(done, 1);
    when 'veteran' then xp := 80; target := 3;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since;
      done := least(done, 3);
    when 'rival' then xp := 50; target := 1;
      -- This week's member rematch vs an opponent NOT rematched last week.
      select count(*) into done from public.challenges cur
        where cur.type = 'REMATCH'
          and (cur.challenger_id = me or cur.opponent_id = me)
          and cur.opponent_id is not null
          and cur.created_at >= v_week
          and (case when cur.challenger_id = me then cur.opponent_id else cur.challenger_id end) not in (
            select case when challenger_id = me then opponent_id else challenger_id end
            from public.challenges
            where type = 'REMATCH'
              and (challenger_id = me or opponent_id = me)
              and opponent_id is not null
              and created_at >= v_prev and created_at < v_week
          );
      done := least(done, 1);
  end case;
  if done < target then raise exception 'Quest not complete yet.'; end if;
  begin
    insert into public.quest_claims (player_id, quest_key, period)
      values (me, p_quest_key, period);
  exception when unique_violation then
    raise exception 'Already claimed.';
  end;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (me, xp, 'quest:' || p_quest_key, 'quest', p_quest_key || ':' || period, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
end $$;
revoke all on function public.claim_quest(text) from public;
grant execute on function public.claim_quest(text) to authenticated;
