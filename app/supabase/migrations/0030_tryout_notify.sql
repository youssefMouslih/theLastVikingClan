-- VIK Clan migration 0030: notify admins on new tryout requests.
-- Run AFTER 0029. A trigger fans every tryout insert out to all ACTIVE
-- OWNER/ADMIN profiles as in-app notifications (bell + notification center).
-- Server-side by design: logged-out submitters can't reach admin inboxes
-- themselves. The insert is exception-guarded so a notification failure can
-- never break the tryout submission itself.

create or replace function public.notify_admins_tryout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  select p.id, 'TRYOUT_REQUEST', 'New tryout request',
    NEW.name || ' wants to join — review in Admin → Tryouts.',
    'tryout', NEW.id
  from public.profiles p
  where p.role in ('OWNER', 'ADMIN') and p.status = 'ACTIVE';
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists tryout_notify_admins on public.tryout_requests;
create trigger tryout_notify_admins
  after insert on public.tryout_requests
  for each row execute function public.notify_admins_tryout();
