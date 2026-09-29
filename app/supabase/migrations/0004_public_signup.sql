-- VIK Clan migration 0004: allow public signup profile creation.
-- Run in Supabase dashboard → SQL editor AFTER 0003.
-- Anyone may insert ONLY a plain PLAYER/ACTIVE profile (no privilege
-- escalation via signup); role changes stay owner-managed.

drop policy if exists "public signup insert" on public.profiles;
create policy "public signup insert" on public.profiles
  for insert to anon, authenticated
  with check (role = 'PLAYER' and status = 'ACTIVE');
