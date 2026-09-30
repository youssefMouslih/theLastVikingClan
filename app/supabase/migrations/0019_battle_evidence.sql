-- VIK Clan migration 0019: battle evidence screenshots.
-- Run AFTER 0018. Battle results require photo proof like matches.
-- Files live in the private match-evidence bucket under battles/.

alter table public.challenges
  add column if not exists evidence_path text;
