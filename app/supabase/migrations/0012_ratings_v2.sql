-- VIK Clan migration 0012: 3-dimension peer ratings + title tags.
-- Run AFTER 0011. Keeps legacy `score` as overall; new dimensions optional.

alter table public.ratings
  add column if not exists tactical int check (tactical is null or (tactical >= 1 and tactical <= 5)),
  add column if not exists fairplay int check (fairplay is null or (fairplay >= 1 and fairplay <= 5)),
  add column if not exists connection int check (connection is null or (connection >= 1 and connection <= 5)),
  add column if not exists title_tag text;
