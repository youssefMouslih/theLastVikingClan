-- VIK Clan migration 0025: player-claimed forfeit on match results.
-- Run AFTER 0024. The confirming opponent may check "forfeit" instead of
-- confirming the score: the claim is stored here, the evidence stays blurred
-- for non-admins, and a moderator accepts (FORFEIT) or sends back.

alter table public.matches
  add column if not exists forfeit_claimed_by uuid references public.profiles(id) on delete set null;
