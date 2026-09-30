-- VIK Clan migration 0011: peer ratings + customizable profile banners.
-- Run AFTER 0010.

-- Peer ratings: any member rates another 1–5, one vote each (updatable).
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  rater_id uuid not null references public.profiles(id) on delete cascade,
  rated_id uuid not null references public.profiles(id) on delete cascade,
  score int not null check (score >= 1 and score <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rater_id, rated_id),
  check (rater_id != rated_id)
);

alter table public.ratings enable row level security;

drop policy if exists "authenticated read ratings" on public.ratings;
create policy "authenticated read ratings" on public.ratings
  for select to authenticated using (true);

drop policy if exists "members rate" on public.ratings;
create policy "members rate" on public.ratings
  for insert to authenticated with check (rater_id = auth.uid());

drop policy if exists "members update own rating" on public.ratings;
create policy "members update own rating" on public.ratings
  for update to authenticated using (rater_id = auth.uid());

-- Custom banners on profiles.
alter table public.profiles
  add column if not exists banner_color text,
  add column if not exists banner_image text;
