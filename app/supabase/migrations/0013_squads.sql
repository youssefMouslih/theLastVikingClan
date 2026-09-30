-- VIK Clan migration 0013: War Council squads (3v3 / 4v4).
-- Run AFTER 0012. Leader invites (top-down) + player requests (bottom-up).

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  size int not null check (size in (3, 4)),
  leader_id uuid not null references public.profiles(id) on delete cascade,
  opponent_label text,
  match_at timestamptz,
  status text not null default 'FORMING' check (status in ('FORMING','READY','BATTLE','DONE','DISBANDED')),
  created_at timestamptz not null default now()
);

create table if not exists public.squad_members (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('LEADER','MEMBER')),
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED')),
  created_at timestamptz not null default now(),
  unique (squad_id, player_id)
);
create index if not exists squad_members_player_idx on public.squad_members (player_id, status);

alter table public.squads enable row level security;
alter table public.squad_members enable row level security;

drop policy if exists "authenticated read squads" on public.squads;
create policy "authenticated read squads" on public.squads
  for select to authenticated using (true);

drop policy if exists "members create squads" on public.squads;
create policy "members create squads" on public.squads
  for insert to authenticated with check (leader_id = auth.uid());

drop policy if exists "leaders manage squads" on public.squads;
create policy "leaders manage squads" on public.squads
  for update to authenticated using (leader_id = auth.uid());

drop policy if exists "admins manage squads" on public.squads;
create policy "admins manage squads" on public.squads
  for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));

drop policy if exists "authenticated read squad members" on public.squad_members;
create policy "authenticated read squad members" on public.squad_members
  for select to authenticated using (true);

drop policy if exists "members join squads" on public.squad_members;
create policy "members join squads" on public.squad_members
  for insert to authenticated with check (player_id = auth.uid());

drop policy if exists "members answer squad invites" on public.squad_members;
create policy "members answer squad invites" on public.squad_members
  for update to authenticated using (player_id = auth.uid());

drop policy if exists "admins manage squad members" on public.squad_members;
create policy "admins manage squad members" on public.squad_members
  for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));
