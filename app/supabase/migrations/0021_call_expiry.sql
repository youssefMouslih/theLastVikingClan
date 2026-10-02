-- VIK Clan migration 0021: open-call expiry.
-- Run AFTER 0020. Open calls live 24h, then auto-cancel so the mat
-- never fills with ghosts. Callers can renew (+24h) or cancel anytime.

alter table public.challenges
  add column if not exists expires_at timestamptz;
