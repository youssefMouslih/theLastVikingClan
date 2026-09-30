-- VIK Clan migration 0018: WhatsApp number on profiles.
-- Run AFTER 0017. Covered by existing "update own profile" RLS.
-- Store full international format, e.g. +212600000000.

alter table public.profiles
  add column if not exists whatsapp text;
