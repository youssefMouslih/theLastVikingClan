-- VIK Clan migration 0055: bans + appeals, tryout VIK name, clan banner colour.
--
-- 1. tryout_requests.known_name: the candidate's VIK name, required by the
--    public tryout form; accept-tryout prefills profiles.known_name.
-- 2. clan_settings.banner_color: admins can brand the Clan page with a solid
--    colour (banner_url keeps the uploaded image).
-- 3. profiles BANNED status + ban_reason (staff) + ban_request (member appeal).
--    The app shows a blocking ban screen with the reason and an appeal box.
-- 4. Owner protection: the OWNER can never be banned or suspended, and a ban
--    always needs a written reason.
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE.

-- ============ 1. Tryout VIK name ============
alter table public.tryout_requests
  add column if not exists known_name text;

-- ============ 2. Clan banner colour ============
alter table public.clan_settings
  add column if not exists banner_color text;

-- ============ 3. Ban + appeal columns ============
alter table public.profiles
  add column if not exists ban_reason text;
alter table public.profiles
  add column if not exists ban_request text;
alter table public.profiles
  add column if not exists ban_requested_at timestamptz;

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('INVITED','ACTIVE','INACTIVE','SUSPENDED','LEFT','REMOVED','BANNED'));

-- ============ 4. Owner is untouchable + bans need a reason ============
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The owner can never be silenced, suspended or banned by anyone.
  if NEW.role = 'OWNER' and NEW.status in ('BANNED', 'SUSPENDED') then
    raise exception 'The owner cannot be banned or suspended.';
  end if;
  -- A ban must always carry a motif the member can read.
  if NEW.status = 'BANNED' and coalesce(btrim(NEW.ban_reason), '') = '' then
    raise exception 'A ban needs a reason.';
  end if;
  -- Staff may change anything else.
  if public.is_clan_role(array['OWNER','ADMIN']) then
    return NEW;
  end if;
  -- Everyone else: privileged columns are frozen, but they may write their
  -- own ban appeal (ban_request / ban_requested_at) while banned.
  if (NEW.role is distinct from OLD.role
      or NEW.status is distinct from OLD.status
      or NEW.username is distinct from OLD.username
      or NEW.email is distinct from OLD.email
      or NEW.ban_reason is distinct from OLD.ban_reason) then
    raise exception 'Only staff can change role, status, username, email or ban reason.';
  end if;
  return NEW;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Allow service-role tryout automation to resolve accepted tryouts (0054)
-- is unaffected by this migration.
