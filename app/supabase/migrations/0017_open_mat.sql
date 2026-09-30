-- VIK Clan migration 0017: open friendly mat.
-- Run AFTER 0016. Open calls have no opponent yet — anyone may answer,
-- and posting alerts the whole clan.

alter table public.challenges
  add column if not exists is_open boolean not null default false;
