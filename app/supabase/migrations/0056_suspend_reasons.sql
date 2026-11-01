-- VIK Clan migration 0056: suspensions get the same blocking screen + appeal as bans.
--
-- 1. profiles.suspend_reason (staff) + suspend_request / suspend_requested_at
--    (member's reactivation request). A SUSPENDED member keeps their session
--    so the app can render the blocking screen instead of silently signing out.
-- 2. guard_profile_update: a suspension now also needs a written reason;
--    non-staff may write their own suspend_request, but not the reason.
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE.

alter table public.profiles
  add column if not exists suspend_reason text;
alter table public.profiles
  add column if not exists suspend_request text;
alter table public.profiles
  add column if not exists suspend_requested_at timestamptz;

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The owner can never be silenced, suspended or banned by anyone.
  if NEW.role = 'OWNER' and NEW.status in ('BANNED', 'SUSPENDED') then
    raise exception 'The owner cannot be banned or suspended.';
  end if;
  -- A ban or suspension must always carry a motif the member can read.
  if NEW.status = 'BANNED' and coalesce(btrim(NEW.ban_reason), '') = '' then
    raise exception 'A ban needs a reason.';
  end if;
  if NEW.status = 'SUSPENDED' and coalesce(btrim(NEW.suspend_reason), '') = '' then
    raise exception 'A suspension needs a reason.';
  end if;
  -- Staff may change anything else.
  if public.is_clan_role(array['OWNER','ADMIN']) then
    return NEW;
  end if;
  -- Everyone else: privileged columns are frozen, but they may write their
  -- own appeal (ban_request / suspend_request) while restricted.
  if (NEW.role is distinct from OLD.role
      or NEW.status is distinct from OLD.status
      or NEW.username is distinct from OLD.username
      or NEW.email is distinct from OLD.email
      or NEW.ban_reason is distinct from OLD.ban_reason
      or NEW.suspend_reason is distinct from OLD.suspend_reason) then
    raise exception 'Only staff can change role, status, username, email, ban or suspension reason.';
  end if;
  return NEW;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();
