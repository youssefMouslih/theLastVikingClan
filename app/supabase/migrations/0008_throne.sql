-- VIK Clan migration 0008: King's Throne (champion + reigns + defenses).
-- Run in Supabase dashboard → SQL editor AFTER 0007.
-- Current champion = row with ended_at IS NULL. Title defenses increment
-- when the holder wins a throne challenge; losing transfers the throne.

create table if not exists public.throne_reigns (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  defenses int not null default 0,
  won_from uuid references public.profiles(id) on delete set null,
  competition_id uuid references public.competitions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists throne_current_idx on public.throne_reigns (ended_at) where ended_at is null;

alter table public.challenges
  add column if not exists for_throne boolean not null default false;

alter table public.throne_reigns enable row level security;

drop policy if exists "authenticated read throne" on public.throne_reigns;
create policy "authenticated read throne" on public.throne_reigns
  for select to authenticated using (true);

drop policy if exists "admins manage throne" on public.throne_reigns;
create policy "admins manage throne" on public.throne_reigns
  for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));
