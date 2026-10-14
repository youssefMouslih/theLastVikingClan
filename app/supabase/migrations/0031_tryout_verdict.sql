-- VIK Clan migration 0031: tester assignment + verdict on tryout requests.
-- Run AFTER 0030. An admin assigns a clan member as tester; the tester plays
-- the trial match and reports PASS/FAIL with the score. Trust model matches
-- the rest of the app (client-scoped writes, everything visible to admins).

alter table public.tryout_requests
  add column if not exists assigned_tester_id uuid references public.profiles(id) on delete set null,
  add column if not exists verdict text check (verdict is null or verdict in ('PASS', 'FAIL')),
  add column if not exists verdict_score_a smallint,
  add column if not exists verdict_score_b smallint,
  add column if not exists verdict_note text,
  add column if not exists verdict_at timestamptz;

-- Assigned tester reads only their own tasks.
drop policy if exists "tester reads tasks" on public.tryout_requests;
create policy "tester reads tasks"
  on public.tryout_requests for select to authenticated
  using (assigned_tester_id = auth.uid());

-- Assigned tester reports the verdict on their own tasks.
drop policy if exists "tester reports verdict" on public.tryout_requests;
create policy "tester reports verdict"
  on public.tryout_requests for update to authenticated
  using (assigned_tester_id = auth.uid())
  with check (assigned_tester_id = auth.uid());

create index if not exists tryout_requests_tester
  on public.tryout_requests (assigned_tester_id) where status = 'PENDING';

-- Notify the tester the moment they are assigned.
create or replace function public.notify_tester_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  values (NEW.assigned_tester_id, 'TRYOUT_REQUEST', 'Tester task',
    NEW.name || ' awaits your trial match — report the verdict.',
    'tryout', NEW.id);
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists tryout_notify_tester on public.tryout_requests;
create trigger tryout_notify_tester
  after update of assigned_tester_id on public.tryout_requests
  for each row
  when (NEW.assigned_tester_id is not null and OLD.assigned_tester_id is distinct from NEW.assigned_tester_id)
  execute function public.notify_tester_assigned();

-- Notify admins the moment a verdict lands.
create or replace function public.notify_verdict_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
  select p.id, 'TRYOUT_REQUEST', 'Trial verdict in',
    NEW.name || ': ' || NEW.verdict ||
    coalesce(' ' || NEW.verdict_score_a || '-' || NEW.verdict_score_b, '') || ' — review in Admin → Tryouts.',
    'tryout', NEW.id
  from public.profiles p
  where p.role in ('OWNER', 'ADMIN') and p.status = 'ACTIVE';
  return NEW;
exception when others then
  return NEW;
end $$;

drop trigger if exists tryout_notify_verdict on public.tryout_requests;
create trigger tryout_notify_verdict
  after update of verdict on public.tryout_requests
  for each row
  when (NEW.verdict is not null and OLD.verdict is distinct from NEW.verdict)
  execute function public.notify_verdict_submitted();
