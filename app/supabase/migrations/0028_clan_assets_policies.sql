-- VIK Clan migration 0028: storage policies for clan-assets (badge forge).
-- Run AFTER 0027. The clan-assets bucket (banners, forged honour badges)
-- had no storage.objects policies, so badge uploads failed with
-- "new row violates row-level security policy".
-- Members read; OWNER/ADMIN manage (badge forge is Admin → Honours).

-- Helper (also defined in 0001; repeated here so this file works even if
-- 0001 was skipped or partially applied — CREATE OR REPLACE is idempotent).
create or replace function public.is_clan_role(required text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = any(required) and p.status = 'ACTIVE'
  );
$$;

do $$ begin
  create policy "members read clan assets" on storage.objects for select to authenticated using (bucket_id = 'clan-assets');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "admins manage clan assets" on storage.objects for all to authenticated using (bucket_id = 'clan-assets' and public.is_clan_role(array['OWNER','ADMIN'])) with check (bucket_id = 'clan-assets');
exception when duplicate_object then null; end $$;
