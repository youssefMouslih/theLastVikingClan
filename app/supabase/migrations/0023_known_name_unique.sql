-- VIK Clan migration 0023: warrior tag uniqueness.
-- Run AFTER 0022. Warrior tags (known_name, e.g. "VIK Pride") must be unique
-- case-insensitively so mentions, challenges and the gallery never collide.
-- NULL/empty tags stay allowed (onboarding forces a real tag on signup).

create unique index if not exists profiles_known_name_unique
  on public.profiles (lower(known_name))
  where known_name is not null and known_name <> '';
