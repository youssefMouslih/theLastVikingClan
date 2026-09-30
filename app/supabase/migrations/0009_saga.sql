-- VIK Clan migration 0009: saga progression (Glory XP + quest claims).
-- Run in Supabase dashboard → SQL editor AFTER 0008.
-- xp_ledger: every Glory award is a row (idempotent via unique ref).
-- quest_claims: one claim per player/quest/period blocks double-claims.

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount > 0),
  reason text not null,
  ref_type text not null default 'manual',
  ref_id text not null default '',
  season text not null default '',
  created_at timestamptz not null default now(),
  unique (player_id, ref_type, ref_id, reason)
);
create index if not exists xp_player_season_idx on public.xp_ledger (player_id, season);

create table if not exists public.quest_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  quest_key text not null,
  period text not null,
  created_at timestamptz not null default now(),
  unique (player_id, quest_key, period)
);

alter table public.xp_ledger enable row level security;
alter table public.quest_claims enable row level security;

drop policy if exists "authenticated read xp" on public.xp_ledger;
create policy "authenticated read xp" on public.xp_ledger
  for select to authenticated using (true);

drop policy if exists "members earn xp" on public.xp_ledger;
create policy "members earn xp" on public.xp_ledger
  for insert to authenticated with check (player_id = auth.uid());

drop policy if exists "authenticated read claims" on public.quest_claims;
create policy "authenticated read claims" on public.quest_claims
  for select to authenticated using (true);

drop policy if exists "members claim quests" on public.quest_claims;
create policy "members claim quests" on public.quest_claims
  for insert to authenticated with check (player_id = auth.uid());
