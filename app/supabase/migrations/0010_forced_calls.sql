-- VIK Clan migration 0010: unrefusable Head calls (100 GP bounty).
-- Run AFTER 0009. A forced call costs nothing upfront but requires the
-- challenger to HOLD 100 GP; winner takes +100 from the clan pool.

alter table public.challenges
  add column if not exists forced boolean not null default false;
