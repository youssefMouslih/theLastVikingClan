-- VIK Clan migration 0024: forged badge images on achievements.
-- Run AFTER 0023. The badge forge (src/services/badgeForge.ts) renders one
-- Viking-themed badge PNG per honour and stores the storage path here.
-- Files live in the private clan-assets bucket under badges/.

alter table public.achievements
  add column if not exists image_url text;
