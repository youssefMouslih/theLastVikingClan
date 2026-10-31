-- VIK Clan migration 0054: let the service role resolve tryout requests.
--
-- 0034's guard_tryout_verdict only allowed callers with an OWNER/ADMIN JWT.
-- Trusted server code (the accept-tryout Edge Function) uses the service role,
-- whose auth.uid() is null, so marking an accepted tryout failed with:
--   "Testers can only report the verdict, never resolve requests."
--
-- The Edge Function now resolves with the admin's own JWT, which works without
-- this migration. Applying it is still recommended: it makes service-role
-- automation (scripts, future functions) able to resolve tryouts.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

create or replace function public.guard_tryout_verdict()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Trusted server-side callers bypass the tester/player restrictions.
  if coalesce(auth.role(), '') = 'service_role' then
    return NEW;
  end if;
  if public.is_clan_role(array['OWNER','ADMIN']) then
    return NEW;
  end if;
  if (NEW.status is distinct from OLD.status
      or NEW.admin_note is distinct from OLD.admin_note
      or NEW.assigned_tester_id is distinct from OLD.assigned_tester_id
      or NEW.name is distinct from OLD.name
      or NEW.contact is distinct from OLD.contact
      or NEW.email is distinct from OLD.email
      or NEW.note is distinct from OLD.note) then
    raise exception 'Testers can only report the verdict, never resolve requests.';
  end if;
  return NEW;
end $$;

drop trigger if exists tryout_verdict_guard on public.tryout_requests;
create trigger tryout_verdict_guard
  before update on public.tryout_requests
  for each row execute function public.guard_tryout_verdict();
