-- VIK Clan migration 0027: admin-controlled platform access (signup toggle).
-- Run AFTER 0026. Adds a single registration_open flag on clan_settings so
-- admins can show or hide the Create account button on the login screen.
-- The login page (logged out) must read this flag: open a minimal anon
-- SELECT on clan_settings (single public row; writes stay owner/admin-only).

alter table public.clan_settings
  add column if not exists registration_open boolean not null default true;

drop policy if exists "anon read clan settings" on public.clan_settings;
create policy "anon read clan settings"
  on public.clan_settings for select to anon using (true);
