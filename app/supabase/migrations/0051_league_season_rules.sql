-- VIK Clan migration 0051: 4vs4 season rules.
--
-- Admins write the competition rules while the season is DRAFT/REGISTRATION
-- (or correct them while ACTIVE). The text is shown to every player on the
-- 4vs4 hub.

alter table public.league_seasons add column if not exists rules text;

alter table public.league_seasons drop constraint if exists league_seasons_rules_check;
alter table public.league_seasons add constraint league_seasons_rules_check
  check (rules is null or char_length(rules) <= 5000);

create or replace function public.league_set_season_rules(
  p_season_id uuid,
  p_rules text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
  v_rules text := nullif(btrim(coalesce(p_rules, '')), '');
begin
  perform public.league_require_admin();
  v_season := public.league_lock_season(p_season_id);

  if v_season.status not in ('DRAFT','REGISTRATION','ACTIVE') then
    raise exception 'Rules can only be edited before the season is completed.';
  end if;
  if v_rules is not null and char_length(v_rules) > 5000 then
    raise exception 'Rules must be 5000 characters or less.';
  end if;

  update public.league_seasons
    set rules = v_rules
    where id = p_season_id;

  perform public.league_audit(
    p_season_id,
    'SEASON_RULES_UPDATED',
    'league_season',
    p_season_id,
    jsonb_build_object('rules', v_season.rules),
    jsonb_build_object('rules', v_rules),
    null);
end;
$$;

revoke all on function public.league_set_season_rules(uuid, text) from public, anon, authenticated;
grant execute on function public.league_set_season_rules(uuid, text) to authenticated;
