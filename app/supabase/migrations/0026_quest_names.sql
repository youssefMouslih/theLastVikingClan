-- VIK Clan migration 0026: admin-switchable quest names.
-- Run AFTER 0025. Quest board titles stay classic by default; an Owner/Admin
-- may switch the whole clan to Old Norse war-word titles (localized glossary
-- in app). No quest logic changes — display only.

alter table public.clan_settings
  add column if not exists quest_names text not null default 'classic'
  check (quest_names in ('classic', 'norse'));
