-- VIK Clan migration 0022: warrior known name (e.g. "VIK Pride").
-- Run AFTER 0021. Real name = display_name (relabeled in UI).
-- eFootball name stays the exact in-game name.

alter table public.profiles
  add column if not exists known_name text;
