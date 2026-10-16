-- VIK Clan migration 0039: account-level gaps.
-- Run AFTER 0038. Idempotent: IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
--
-- 1. profiles.must_change_password (default false): accept-tryout sets it on
--    provisioned accounts; the app routes flagged users to a blocking screen
--    and clears it after success. Not frozen by guard_profile_update (0034),
--    so owners can change their own password.
-- 2. Password reset needs no SQL (client handles PASSWORD_RECOVERY).
-- 3. Tryout spam: website_url honeypot column (policy rejects non-empty),
--    BEFORE INSERT trigger (definer) enforcing max 3 per contact per 24h and
--    dedupe by contact/email while PENDING. Trigger (not unique index) so
--    pre-existing duplicates can never break the migration.
-- 4. transfer_ownership(p_new_owner, p_confirmation): OWNER-only, target must
--    be ACTIVE ADMIN, confirmation must equal the target username exactly.
--    Atomic swap (target first, then self — keeps the 0034 profile trigger
--    happy), audit-logged. Exactly one OWNER before and after.
-- 5. Ratings: rater must share a CONFIRMED/FORFEIT match or COMPLETED battle
--    with the rated warrior (INSERT + UPDATE WITH CHECK).

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- ============ tryout spam protection ============
alter table public.tryout_requests
  add column if not exists website_url text;
drop policy if exists "anon submit tryout" on public.tryout_requests;
create policy "anon submit tryout"
  on public.tryout_requests for insert to anon, authenticated
  with check (status = 'PENDING' and char_length(name) > 0 and char_length(contact) > 0
    and (website_url is null or website_url = ''));
create or replace function public.guard_tryout_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  recent int;
begin
  -- Honeypot: invisible to humans, irresistible to bots.
  if NEW.website_url is not null and NEW.website_url != '' then
    raise exception 'Submission blocked. Contact us on WhatsApp.';
  end if;
  -- Rate limit: max 3 requests per contact per 24h.
  select count(*) into recent from public.tryout_requests
    where contact = NEW.contact and created_at > now() - interval '24 hours';
  if recent >= 3 then
    raise exception 'Too many requests from this contact — try again tomorrow.';
  end if;
  -- Dedupe: one PENDING request per contact/email at a time.
  if exists (select 1 from public.tryout_requests
      where status = 'PENDING'
        and (contact = NEW.contact
          or (NEW.email is not null and email is not null and lower(email) = lower(NEW.email)))) then
    raise exception 'You already have a pending request — we will contact you on WhatsApp.';
  end if;
  return NEW;
end $$;
drop trigger if exists tryout_insert_guard on public.tryout_requests;
create trigger tryout_insert_guard
  before insert on public.tryout_requests
  for each row execute function public.guard_tryout_insert();

-- ============ owner transfer (exactly one OWNER, always) ============
create or replace function public.transfer_ownership(p_new_owner uuid, p_confirmation text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tgt record;
  r record;
begin
  if me is null or not public.is_clan_role(array['OWNER']) then
    raise exception 'Only the owner can transfer ownership.';
  end if;
  if p_new_owner is null or p_new_owner = me then
    raise exception 'You are already the owner.';
  end if;
  -- Lock both rows in id order so concurrent transfers serialize deadlock-free.
  for r in select id from public.profiles
      where id = me or id = p_new_owner order by id for update loop
    null;
  end loop;
  select * into tgt from public.profiles where id = p_new_owner;
  if tgt is null then raise exception 'Member not found.'; end if;
  if tgt.role != 'ADMIN' or tgt.status != 'ACTIVE' then
    raise exception 'The new owner must be an ACTIVE ADMIN.';
  end if;
  if p_confirmation is distinct from tgt.username then
    raise exception 'Confirmation does not match — type the new owner''s username exactly.';
  end if;
  -- Target first (caller is still OWNER, so the 0034 profile guard passes),
  -- then self. One transaction: never zero or two owners.
  update public.profiles set role = 'OWNER', updated_at = now() where id = tgt.id;
  update public.profiles set role = 'ADMIN', updated_at = now() where id = me;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data, reason)
    values (me, 'ADMIN_TRANSFERRED_OWNERSHIP', 'player', tgt.id,
      jsonb_build_object('role', 'ADMIN'), jsonb_build_object('role', 'OWNER'),
      'Ownership transferred to ' || tgt.username);
  insert into public.notifications (user_id, type, title, message)
    values (tgt.id, 'COMPETITION_FINISHED', 'You hold the throne',
      'Ownership of the clan was transferred to you.');
end $$;
revoke all on function public.transfer_ownership(uuid, text) from public;
grant execute on function public.transfer_ownership(uuid, text) to authenticated;

-- ============ ratings: only rate warriors you have faced ============
drop policy if exists "members rate" on public.ratings;
create policy "members rate" on public.ratings
  for insert to authenticated with check (
    rater_id = auth.uid()
    and (
      exists (select 1 from public.matches m
        where m.status in ('CONFIRMED','FORFEIT')
          and ((m.player_a_id = auth.uid() and m.player_b_id = rated_id)
            or (m.player_a_id = rated_id and m.player_b_id = auth.uid())))
      or exists (select 1 from public.challenges c
        where c.status = 'COMPLETED'
          and ((c.challenger_id = auth.uid() and c.opponent_id = rated_id)
            or (c.challenger_id = rated_id and c.opponent_id = auth.uid())))
    )
  );
drop policy if exists "members update own rating" on public.ratings;
create policy "members update own rating" on public.ratings
  for update to authenticated
  using (rater_id = auth.uid())
  with check (
    rater_id = auth.uid()
    and (
      exists (select 1 from public.matches m
        where m.status in ('CONFIRMED','FORFEIT')
          and ((m.player_a_id = auth.uid() and m.player_b_id = rated_id)
            or (m.player_a_id = rated_id and m.player_b_id = auth.uid())))
      or exists (select 1 from public.challenges c
        where c.status = 'COMPLETED'
          and ((c.challenger_id = auth.uid() and c.opponent_id = rated_id)
            or (c.challenger_id = rated_id and c.opponent_id = auth.uid())))
    )
  );
