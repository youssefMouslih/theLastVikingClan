-- VIK Clan migration 0020: notes on match results.
-- Run AFTER 0019. Player comment travels with the submission;
-- moderator comment travels with a send-back. Covered by existing
-- match UPDATE policies (participants own / staff all).

alter table public.matches
  add column if not exists submission_comment text,
  add column if not exists moderation_comment text;
