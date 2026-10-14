-- VIK Clan migration 0032: email on tryout requests (auto-provisioning).
-- Run AFTER 0031. The tryout form mirrors signup (name + email + WhatsApp)
-- so an accepted candidate's account can be created directly — no password
-- is ever collected or stored; the candidate sets it via Supabase invite email.
-- The existing anon-insert policy already permits the new nullable column.

alter table public.tryout_requests
  add column if not exists email text;
