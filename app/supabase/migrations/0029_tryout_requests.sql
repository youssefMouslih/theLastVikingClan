-- VIK Clan migration 0029: tryout requests (ask to join the clan).
-- Run AFTER 0028. Logged-out visitors submit a tryout request from the
-- login page (name + WhatsApp + optional note). Anyone may insert ONLY a
-- fresh PENDING request; OWNER/ADMIN read and resolve (accept/decline).

create table if not exists public.tryout_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text not null,
  note text,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'DECLINED')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tryout_requests enable row level security;

drop policy if exists "anon submit tryout" on public.tryout_requests;
create policy "anon submit tryout"
  on public.tryout_requests for insert to anon
  with check (status = 'PENDING' and char_length(name) > 0 and char_length(contact) > 0);

drop policy if exists "admins manage tryouts" on public.tryout_requests;
create policy "admins manage tryouts"
  on public.tryout_requests for all to authenticated
  using (public.is_clan_role(array['OWNER', 'ADMIN']))
  with check (public.is_clan_role(array['OWNER', 'ADMIN']));

create index if not exists tryout_requests_status_created
  on public.tryout_requests (status, created_at desc);
