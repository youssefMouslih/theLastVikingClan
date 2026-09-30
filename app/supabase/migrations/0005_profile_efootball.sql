-- VIK Clan migration 0005: eFootball identity on profiles.
-- Run in Supabase dashboard → SQL editor AFTER 0004.
-- Highest divisions (PvP / vs AI) + favourite player card + avatar path.
-- Existing "update own profile" RLS already covers these columns.

alter table public.profiles
  add column if not exists division_pvp text,
  add column if not exists division_ai text,
  add column if not exists fav_player_name text,
  add column if not exists fav_player_rating int check (fav_player_rating is null or (fav_player_rating >= 0 and fav_player_rating <= 100)),
  add column if not exists fav_player_position text;
