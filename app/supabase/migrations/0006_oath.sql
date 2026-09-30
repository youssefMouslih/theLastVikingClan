-- VIK Clan migration 0006: oath acceptance timestamp.
-- Run in Supabase dashboard → SQL editor AFTER 0005.
-- Members swear the Viking's Oath; join flows require it.
-- Covered by existing "update own profile" RLS (own row only).

alter table public.profiles
  add column if not exists oath_accepted_at timestamptz;
