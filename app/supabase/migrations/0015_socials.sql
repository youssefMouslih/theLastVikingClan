-- VIK Clan migration 0015: social links on profiles.
-- Run AFTER 0014. Covered by existing "update own profile" RLS.

alter table public.profiles
  add column if not exists instagram text,
  add column if not exists tiktok text,
  add column if not exists kick text;
