-- VIK Clan migration 0016: GP gifts between members.
-- Run AFTER 0015.
-- 1. Ledger allows negative rows so gifts move Glory giver -> receiver.
-- 2. gp_requests tracks ask-for-Glory favors with accept/decline.

alter table public.xp_ledger drop constraint if exists xp_ledger_amount_check;
alter table public.xp_ledger add check (amount != 0);

create table if not exists public.gp_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  giver_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount >= 5 and amount <= 500),
  message text,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id != giver_id)
);
create index if not exists gp_req_giver_idx on public.gp_requests (giver_id, status);

alter table public.gp_requests enable row level security;

drop policy if exists "authenticated read gifts" on public.gp_requests;
create policy "authenticated read gifts" on public.gp_requests
  for select to authenticated using (true);

drop policy if exists "members request gifts" on public.gp_requests;
create policy "members request gifts" on public.gp_requests
  for insert to authenticated with check (requester_id = auth.uid());

drop policy if exists "parties answer gifts" on public.gp_requests;
create policy "parties answer gifts" on public.gp_requests
  for update to authenticated using (giver_id = auth.uid() or requester_id = auth.uid());

drop policy if exists "admins manage gifts" on public.gp_requests;
create policy "admins manage gifts" on public.gp_requests
  for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));
