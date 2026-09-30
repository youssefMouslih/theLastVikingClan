-- VIK Clan migration 0007: battle challenges (Battle Code).
-- Run in Supabase dashboard → SQL editor AFTER 0006.
-- HEAD/FRIENDLY/HONOR/REMATCH/WAR challenges between members.
-- Acceptance is voluntary; outcomes are recorded in battle history.

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid references public.profiles(id) on delete cascade,
  opponent_label text,
  type text not null check (type in ('HEAD','FRIENDLY','HONOR','REMATCH','WAR')),
  conditions text,
  stakes text,
  status text not null default 'PENDING'
    check (status in ('PENDING','ACCEPTED','DECLINED','RESULT_SUBMITTED','COMPLETED','CANCELLED')),
  score_a int check (score_a is null or score_a >= 0),
  score_b int check (score_b is null or score_b >= 0),
  submitted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  check (challenger_id != opponent_id)
);
create index if not exists challenges_opponent_idx on public.challenges (opponent_id, status);
create index if not exists challenges_challenger_idx on public.challenges (challenger_id, status);

alter table public.challenges enable row level security;

drop policy if exists "authenticated read challenges" on public.challenges;
create policy "authenticated read challenges" on public.challenges
  for select to authenticated using (true);

drop policy if exists "members issue challenges" on public.challenges;
create policy "members issue challenges" on public.challenges
  for insert to authenticated with check (challenger_id = auth.uid());

drop policy if exists "participants update challenges" on public.challenges;
create policy "participants update challenges" on public.challenges
  for update to authenticated using (challenger_id = auth.uid() or opponent_id = auth.uid());

drop policy if exists "admins manage challenges" on public.challenges;
create policy "admins manage challenges" on public.challenges
  for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));
