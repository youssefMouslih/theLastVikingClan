-- VIK Clan migration 0003: soft-delete + two-person delete rule.
-- Run in Supabase dashboard → SQL editor AFTER 0002.
-- Competitions are never hard-deleted: is_deleted hides them from players
-- while history stays in the database.

alter table public.competitions
  add column if not exists is_deleted boolean not null default false,
  add column if not exists delete_requested_by uuid references public.profiles(id),
  add column if not exists delete_requested_at timestamptz,
  add column if not exists delete_approved_by uuid references public.profiles(id);

-- Players must not see soft-deleted competitions (admins still can).
drop policy if exists "authenticated read competitions" on public.competitions;
drop policy if exists "members read live competitions" on public.competitions;
create policy "members read live competitions" on public.competitions
  for select to authenticated
  using (is_deleted = false or public.is_clan_role(array['OWNER','ADMIN']));
