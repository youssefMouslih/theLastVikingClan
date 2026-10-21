-- VIK Clan migration 0043: 4vs4 League hardening (Phase 8).
-- Run AFTER 0042. Additive indexes and least-privilege trigger grants.
--
-- No table, policy or RPC changes. The deadline cron scans matchdays by
-- status/deadline and fixtures by matchday/status; the schedule lists byes by
-- season; standings/stats filter fixtures by season/status.

-- 0040 trigger helpers kept PostgreSQL's default PUBLIC EXECUTE. Direct calls
-- fail, but clients have no reason to hold EXECUTE at all.
revoke all on function public.league_touch_updated_at() from public, anon, authenticated;
revoke all on function public.league_guard_team() from public, anon, authenticated;
revoke all on function public.league_guard_member() from public, anon, authenticated;
revoke all on function public.league_guard_invite() from public, anon, authenticated;
revoke all on function public.league_guard_fixture() from public, anon, authenticated;
revoke all on function public.league_guard_lineup() from public, anon, authenticated;
revoke all on function public.league_guard_lineup_player() from public, anon, authenticated;
revoke all on function public.league_guard_duel() from public, anon, authenticated;
revoke all on function public.league_guard_substitution() from public, anon, authenticated;
revoke all on function public.league_guard_duel_report() from public, anon, authenticated;
revoke all on function public.league_guard_dispute() from public, anon, authenticated;

-- Cron: open and close scans on league_matchdays.
create index if not exists league_matchdays_status_opens_idx
  on public.league_matchdays (status, opens_at);

create index if not exists league_matchdays_status_deadline_idx
  on public.league_matchdays (status, deadline);

-- Cron: pending fixtures per matchday, and standings/stats by final status.
create index if not exists league_fixtures_matchday_status_idx
  on public.league_fixtures (matchday_id, status);

create index if not exists league_fixtures_season_status_idx
  on public.league_fixtures (season_id, status);

-- Schedule page: byes are read by season.
create index if not exists league_byes_season_idx
  on public.league_byes (season_id, matchday_id);
