-- VIK Clan FULL database setup: entire schema in ONE run (0001 through 0026).
-- Paste the whole file into Supabase SQL editor and Run.
-- Safe to re-run: every statement is IF NOT EXISTS / DROP IF EXISTS / OR REPLACE.
-- If you already ran an older FULL_SETUP.sql, just run the newer 00NN_*.sql
-- migration files you are missing (in numeric order) instead of this file.

-- ========== 0001 base schema (idempotent) ==========
-- VIK Clan initial schema (§74-87). Single-clan, UTC timestamps.
-- Run in Supabase SQL editor. RLS enabled on all tables (§88).

-- profiles (§74). id = auth.users.id
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  email text,
  avatar_url text,
  country text,
  efootball_name text,
  efootball_id text,
  bio text,
  role text not null default 'PLAYER' check (role in ('OWNER','ADMIN','MODERATOR','PLAYER')),
  status text not null default 'INVITED' check (status in ('INVITED','ACTIVE','INACTIVE','SUSPENDED','LEFT','REMOVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Helper: check role from JWT-linked profile (must come AFTER profiles table)
create or replace function public.is_clan_role(required text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = any(required) and p.status = 'ACTIVE'
  );
$$;

-- clan_settings (§14). Single row enforced by app logic.
create table if not exists public.clan_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'VIK',
  tag text,
  logo_url text,
  banner_url text,
  description text,
  rules text,
  country text,
  timezone text not null default 'Africa/Casablanca',
  quest_names text not null default 'classic' check (quest_names in ('classic', 'norse')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- competitions (§76)
create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  type text not null check (type in ('LEAGUE','CUP','TOURNAMENT','SPECIAL_EVENT')),
  status text not null default 'DRAFT' check (status in ('DRAFT','REGISTRATION_OPEN','REGISTRATION_CLOSED','READY','ACTIVE','FINISHED','ARCHIVED')),
  min_players int not null default 4 check (min_players >= 2),
  max_players int not null default 16 check (max_players >= min_players),
  registration_start timestamptz,
  registration_deadline timestamptz,
  start_date timestamptz,
  end_date timestamptz,
  match_deadline_hours int not null default 48,
  join_code text unique not null,
  join_enabled boolean not null default true,
  format text,
  points_win int not null default 3,
  points_draw int not null default 1,
  points_loss int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.competition_participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'REGISTERED',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  replacement_for uuid references public.profiles(id),
  replacement_date timestamptz,
  replacement_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, player_id)
);

create table if not exists public.competition_waitlist (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  position int not null,
  joined_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'WAITING',
  unique (competition_id, player_id)
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round_number int not null,
  name text not null,
  start_date timestamptz,
  deadline timestamptz,
  status text not null default 'SCHEDULED',
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete set null,
  player_a_id uuid not null references public.profiles(id) on delete restrict,
  player_b_id uuid not null references public.profiles(id) on delete restrict,
  score_a int check (score_a is null or score_a >= 0),
  score_b int check (score_b is null or score_b >= 0),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','PLAYED','RESULT_SUBMITTED','CONFIRMED','DISPUTED','OVERDUE','FORFEIT','CANCELLED')),
  scheduled_at timestamptz,
  deadline timestamptz,
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  winner_id uuid references public.profiles(id),
  forfeit_player_id uuid references public.profiles(id),
  forfeit_claimed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_a_id != player_b_id)
);

create table if not exists public.match_evidence (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  file_path text not null,
  file_type text,
  file_size int,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  reason text not null,
  description text,
  status text not null default 'OPEN' check (status in ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED')),
  resolved_by uuid references public.profiles(id),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  priority text not null default 'NORMAL' check (priority in ('NORMAL','IMPORTANT','URGENT')),
  created_by uuid references public.profiles(id),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid references public.competitions(id) on delete set null,
  type text not null,
  name text not null,
  description text,
  image_url text,
  awarded_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists audit_entity_idx on public.audit_logs (entity_type, entity_id);

-- Storage buckets (§91): avatars, clan-assets, match-evidence (create via dashboard or API).
insert into storage.buckets (id, name, public) values ('avatars','avatars',false), ('clan-assets','clan-assets',false), ('match-evidence','match-evidence',false)
on conflict (id) do nothing;

-- RLS (§88): deny-by-default, then starter policies
alter table public.profiles enable row level security;
alter table public.clan_settings enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_participants enable row level security;
alter table public.competition_waitlist enable row level security;
alter table public.rounds enable row level security;
alter table public.matches enable row level security;
alter table public.match_evidence enable row level security;
alter table public.disputes enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.achievements enable row level security;
alter table public.audit_logs enable row level security;

-- Authenticated clan members can read clan data (tighten further after first admin exists)
drop policy if exists "authenticated read profiles" on public.profiles;
create policy "authenticated read profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid());
drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

drop policy if exists "authenticated read clan" on public.clan_settings;
create policy "authenticated read clan" on public.clan_settings for select to authenticated using (true);
drop policy if exists "admins manage clan" on public.clan_settings;
create policy "admins manage clan" on public.clan_settings for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

drop policy if exists "authenticated read competitions" on public.competitions;
create policy "authenticated read competitions" on public.competitions for select to authenticated using (true);
drop policy if exists "admins manage competitions" on public.competitions;
create policy "admins manage competitions" on public.competitions for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

drop policy if exists "authenticated read participants" on public.competition_participants;
create policy "authenticated read participants" on public.competition_participants for select to authenticated using (true);
drop policy if exists "admins manage participants" on public.competition_participants;
create policy "admins manage participants" on public.competition_participants for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));

drop policy if exists "authenticated read matches" on public.matches;
create policy "authenticated read matches" on public.matches for select to authenticated using (true);
drop policy if exists "players submit own matches" on public.matches;
create policy "players submit own matches" on public.matches for update to authenticated using (
  auth.uid() = player_a_id or auth.uid() = player_b_id or public.is_clan_role(array['OWNER','ADMIN','MODERATOR'])
);
drop policy if exists "admins manage matches" on public.matches;
create policy "admins manage matches" on public.matches for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());


-- ========== 0002_phase7_policies.sql ==========
-- VIK Clan migration 0002: Phase 7 policies + realtime.
-- Run this in Supabase dashboard → SQL editor AFTER 0001.
-- Fills RLS gaps found during Phase 4-6 implementation, enables realtime.

-- ---------- rounds ----------
alter table public.rounds enable row level security;
drop policy if exists "authenticated read rounds" on public.rounds;
create policy "authenticated read rounds" on public.rounds for select to authenticated using (true);
drop policy if exists "admins manage rounds" on public.rounds;
create policy "admins manage rounds" on public.rounds for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

-- ---------- announcements (§65) ----------
alter table public.announcements enable row level security;
drop policy if exists "authenticated read announcements" on public.announcements;
create policy "authenticated read announcements" on public.announcements for select to authenticated using (true);
drop policy if exists "admins manage announcements" on public.announcements;
create policy "admins manage announcements" on public.announcements for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

-- ---------- disputes (§41-43) ----------
alter table public.disputes enable row level security;
drop policy if exists "authenticated read disputes" on public.disputes;
create policy "authenticated read disputes" on public.disputes for select to authenticated using (true);
drop policy if exists "members open disputes" on public.disputes;
create policy "members open disputes" on public.disputes for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "admins manage disputes" on public.disputes;
create policy "admins manage disputes" on public.disputes for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));

-- ---------- match_evidence (§38) ----------
alter table public.match_evidence enable row level security;
drop policy if exists "authenticated read evidence" on public.match_evidence;
create policy "authenticated read evidence" on public.match_evidence for select to authenticated using (true);
drop policy if exists "members upload evidence" on public.match_evidence;
create policy "members upload evidence" on public.match_evidence for insert to authenticated with check (uploaded_by = auth.uid());
drop policy if exists "admins manage evidence" on public.match_evidence;
create policy "admins manage evidence" on public.match_evidence for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));

-- ---------- participants: self join/leave (Rule 2-3 checked in app + constraints) ----------
drop policy if exists "members join competitions" on public.competition_participants;
create policy "members join competitions" on public.competition_participants for insert to authenticated with check (player_id = auth.uid());
drop policy if exists "members leave competitions" on public.competition_participants;
create policy "members leave competitions" on public.competition_participants for delete to authenticated using (player_id = auth.uid());

-- ---------- waitlist ----------
alter table public.competition_waitlist enable row level security;
drop policy if exists "authenticated read waitlist" on public.competition_waitlist;
create policy "authenticated read waitlist" on public.competition_waitlist for select to authenticated using (true);
drop policy if exists "members join waitlist" on public.competition_waitlist;
create policy "members join waitlist" on public.competition_waitlist for insert to authenticated with check (player_id = auth.uid());
drop policy if exists "members leave waitlist" on public.competition_waitlist;
create policy "members leave waitlist" on public.competition_waitlist for delete to authenticated using (player_id = auth.uid());
drop policy if exists "admins manage waitlist" on public.competition_waitlist;
create policy "admins manage waitlist" on public.competition_waitlist for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

-- ---------- notifications (§67-69): in-app inserts created client-side, hardened later via Edge Functions (§100) ----------
drop policy if exists "members create notifications" on public.notifications;
create policy "members create notifications" on public.notifications for insert to authenticated with check (true);
drop policy if exists "own update notifications" on public.notifications;
create policy "own update notifications" on public.notifications for update to authenticated using (user_id = auth.uid());

-- ---------- audit_logs (§73): anyone authenticated can append, only admins read ----------
alter table public.audit_logs enable row level security;
drop policy if exists "members append audit" on public.audit_logs;
create policy "members append audit" on public.audit_logs for insert to authenticated with check (true);
drop policy if exists "admins read audit" on public.audit_logs;
create policy "admins read audit" on public.audit_logs for select to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

-- ---------- achievements ----------
alter table public.achievements enable row level security;
drop policy if exists "authenticated read achievements" on public.achievements;
create policy "authenticated read achievements" on public.achievements for select to authenticated using (true);
drop policy if exists "admins manage achievements" on public.achievements;
create policy "admins manage achievements" on public.achievements for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

-- ---------- storage: match-evidence + avatars + clan-assets (private, authenticated only) ----------
-- Run once; duplicate_object errors mean the policy already exists — safe to ignore.
do $$ begin
  create policy "members read evidence" on storage.objects for select to authenticated using (bucket_id = 'match-evidence');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members upload evidence" on storage.objects for insert to authenticated with check (bucket_id = 'match-evidence');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members read avatars" on storage.objects for select to authenticated using (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members manage own avatar" on storage.objects for all to authenticated using (bucket_id = 'avatars') with check (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;

-- ---------- realtime (§90): enable for live tables ----------
-- If any line errors (already added), ignore and continue.
do $$ begin alter publication supabase_realtime add table public.matches; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.competitions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.competition_participants; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.announcements; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.disputes; exception when duplicate_object then null; end $$;


-- ========== 0003_soft_delete.sql ==========
-- VIK Clan migration 0003: soft-delete + two-person delete rule.
-- Run in Supabase dashboard → SQL editor AFTER 0002.
-- Competitions are never hard-deleted: is_deleted hides them from players
-- while history stays in the database.

alter table public.competitions
  add column if not exists is_deleted boolean not null default false,
  add column if not exists delete_requested_by uuid references public.profiles(id),
  add column if not exists delete_requested_at timestamptz,
  add column if not exists delete_approved_by uuid references public.profiles(id);

-- Players must not see soft-deleted competitions (admins still can).
drop policy if exists "authenticated read competitions" on public.competitions;
drop policy if exists "members read live competitions" on public.competitions;
create policy "members read live competitions" on public.competitions
  for select to authenticated
  using (is_deleted = false or public.is_clan_role(array['OWNER','ADMIN']));


-- ========== 0004_public_signup.sql ==========
-- VIK Clan migration 0004: allow public signup profile creation.
-- Run in Supabase dashboard → SQL editor AFTER 0003.
-- Anyone may insert ONLY a plain PLAYER/ACTIVE profile (no privilege
-- escalation via signup); role changes stay owner-managed.

drop policy if exists "public signup insert" on public.profiles;
create policy "public signup insert" on public.profiles
  for insert to anon, authenticated
  with check (role = 'PLAYER' and status = 'ACTIVE');


-- ========== 0005_profile_efootball.sql ==========
-- VIK Clan migration 0005: eFootball identity on profiles.
-- Run in Supabase dashboard → SQL editor AFTER 0004.
-- Highest divisions (PvP / vs AI) + favourite player card + avatar path.
-- Existing "update own profile" RLS already covers these columns.

alter table public.profiles
  add column if not exists division_pvp text,
  add column if not exists division_ai text,
  add column if not exists fav_player_name text,
  add column if not exists fav_player_rating int check (fav_player_rating is null or (fav_player_rating >= 0 and fav_player_rating <= 100)),
  add column if not exists fav_player_position text;


-- ========== 0006_oath.sql ==========
-- VIK Clan migration 0006: oath acceptance timestamp.
-- Run in Supabase dashboard → SQL editor AFTER 0005.
-- Members swear the Viking's Oath; join flows require it.
-- Covered by existing "update own profile" RLS (own row only).

alter table public.profiles
  add column if not exists oath_accepted_at timestamptz;


-- ========== 0007_challenges.sql ==========
-- VIK Clan migration 0007: battle challenges (Battle Code).
-- Run in Supabase dashboard → SQL editor AFTER 0006.
-- HEAD/FRIENDLY/HONOR/REMATCH/WAR challenges between members.
-- Acceptance is voluntary; outcomes are recorded in battle history.

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid references public.profiles(id) on delete cascade,
  opponent_label text,
  type text not null check (type in ('HEAD','FRIENDLY','HONOR','REMATCH','WAR')),
  conditions text,
  stakes text,
  status text not null default 'PENDING'
    check (status in ('PENDING','ACCEPTED','DECLINED','RESULT_SUBMITTED','COMPLETED','CANCELLED')),
  score_a int check (score_a is null or score_a >= 0),
  score_b int check (score_b is null or score_b >= 0),
  submitted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  check (challenger_id != opponent_id)
);
create index if not exists challenges_opponent_idx on public.challenges (opponent_id, status);
create index if not exists challenges_challenger_idx on public.challenges (challenger_id, status);

alter table public.challenges enable row level security;

drop policy if exists "authenticated read challenges" on public.challenges;
create policy "authenticated read challenges" on public.challenges
  for select to authenticated using (true);

drop policy if exists "members issue challenges" on public.challenges;
create policy "members issue challenges" on public.challenges
  for insert to authenticated with check (challenger_id = auth.uid());

drop policy if exists "participants update challenges" on public.challenges;
create policy "participants update challenges" on public.challenges
  for update to authenticated using (challenger_id = auth.uid() or opponent_id = auth.uid());

drop policy if exists "admins manage challenges" on public.challenges;
create policy "admins manage challenges" on public.challenges
  for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));


-- ========== 0008_throne.sql ==========
-- VIK Clan migration 0008: King's Throne (champion + reigns + defenses).
-- Run in Supabase dashboard → SQL editor AFTER 0007.
-- Current champion = row with ended_at IS NULL. Title defenses increment
-- when the holder wins a throne challenge; losing transfers the throne.

create table if not exists public.throne_reigns (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  defenses int not null default 0,
  won_from uuid references public.profiles(id) on delete set null,
  competition_id uuid references public.competitions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists throne_current_idx on public.throne_reigns (ended_at) where ended_at is null;

alter table public.challenges
  add column if not exists for_throne boolean not null default false;

alter table public.throne_reigns enable row level security;

drop policy if exists "authenticated read throne" on public.throne_reigns;
create policy "authenticated read throne" on public.throne_reigns
  for select to authenticated using (true);

drop policy if exists "admins manage throne" on public.throne_reigns;
create policy "admins manage throne" on public.throne_reigns
  for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));


-- ========== 0009_saga.sql ==========
-- VIK Clan migration 0009: saga progression (Glory XP + quest claims).
-- Run in Supabase dashboard → SQL editor AFTER 0008.
-- xp_ledger: every Glory award is a row (idempotent via unique ref).
-- quest_claims: one claim per player/quest/period blocks double-claims.

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount > 0),
  reason text not null,
  ref_type text not null default 'manual',
  ref_id text not null default '',
  season text not null default '',
  created_at timestamptz not null default now(),
  unique (player_id, ref_type, ref_id, reason)
);
create index if not exists xp_player_season_idx on public.xp_ledger (player_id, season);

create table if not exists public.quest_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  quest_key text not null,
  period text not null,
  created_at timestamptz not null default now(),
  unique (player_id, quest_key, period)
);

alter table public.xp_ledger enable row level security;
alter table public.quest_claims enable row level security;

drop policy if exists "authenticated read xp" on public.xp_ledger;
create policy "authenticated read xp" on public.xp_ledger
  for select to authenticated using (true);

drop policy if exists "members earn xp" on public.xp_ledger;
create policy "members earn xp" on public.xp_ledger
  for insert to authenticated with check (player_id = auth.uid());

drop policy if exists "authenticated read claims" on public.quest_claims;
create policy "authenticated read claims" on public.quest_claims
  for select to authenticated using (true);

drop policy if exists "members claim quests" on public.quest_claims;
create policy "members claim quests" on public.quest_claims
  for insert to authenticated with check (player_id = auth.uid());


-- ========== 0010_forced_calls.sql ==========
-- VIK Clan migration 0010: unrefusable Head calls (100 GP bounty).
-- Run AFTER 0009. A forced call costs nothing upfront but requires the
-- challenger to HOLD 100 GP; winner takes +100 from the clan pool.

alter table public.challenges
  add column if not exists forced boolean not null default false;


-- ========== 0011_ratings_banners.sql ==========
-- VIK Clan migration 0011: peer ratings + customizable profile banners.
-- Run AFTER 0010.

-- Peer ratings: any member rates another 1–5, one vote each (updatable).
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  rater_id uuid not null references public.profiles(id) on delete cascade,
  rated_id uuid not null references public.profiles(id) on delete cascade,
  score int not null check (score >= 1 and score <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rater_id, rated_id),
  check (rater_id != rated_id)
);

alter table public.ratings enable row level security;

drop policy if exists "authenticated read ratings" on public.ratings;
create policy "authenticated read ratings" on public.ratings
  for select to authenticated using (true);

drop policy if exists "members rate" on public.ratings;
create policy "members rate" on public.ratings
  for insert to authenticated with check (rater_id = auth.uid());

drop policy if exists "members update own rating" on public.ratings;
create policy "members update own rating" on public.ratings
  for update to authenticated using (rater_id = auth.uid());

-- Custom banners on profiles.
alter table public.profiles
  add column if not exists banner_color text,
  add column if not exists banner_image text;


-- ========== 0012_ratings_v2.sql ==========
-- VIK Clan migration 0012: 3-dimension peer ratings + title tags.
-- Run AFTER 0011. Keeps legacy `score` as overall; new dimensions optional.

alter table public.ratings
  add column if not exists tactical int check (tactical is null or (tactical >= 1 and tactical <= 5)),
  add column if not exists fairplay int check (fairplay is null or (fairplay >= 1 and fairplay <= 5)),
  add column if not exists connection int check (connection is null or (connection >= 1 and connection <= 5)),
  add column if not exists title_tag text;


-- ========== 0013_squads.sql ==========
-- VIK Clan migration 0013: War Council squads (3v3 / 4v4).
-- Run AFTER 0012. Leader invites (top-down) + player requests (bottom-up).

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  size int not null check (size in (3, 4)),
  leader_id uuid not null references public.profiles(id) on delete cascade,
  opponent_label text,
  match_at timestamptz,
  status text not null default 'FORMING' check (status in ('FORMING','READY','BATTLE','DONE','DISBANDED')),
  created_at timestamptz not null default now()
);

create table if not exists public.squad_members (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('LEADER','MEMBER')),
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED')),
  created_at timestamptz not null default now(),
  unique (squad_id, player_id)
);
create index if not exists squad_members_player_idx on public.squad_members (player_id, status);

alter table public.squads enable row level security;
alter table public.squad_members enable row level security;

drop policy if exists "authenticated read squads" on public.squads;
create policy "authenticated read squads" on public.squads
  for select to authenticated using (true);

drop policy if exists "members create squads" on public.squads;
create policy "members create squads" on public.squads
  for insert to authenticated with check (leader_id = auth.uid());

drop policy if exists "leaders manage squads" on public.squads;
create policy "leaders manage squads" on public.squads
  for update to authenticated using (leader_id = auth.uid());

drop policy if exists "admins manage squads" on public.squads;
create policy "admins manage squads" on public.squads
  for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));

drop policy if exists "authenticated read squad members" on public.squad_members;
create policy "authenticated read squad members" on public.squad_members
  for select to authenticated using (true);

drop policy if exists "members join squads" on public.squad_members;
create policy "members join squads" on public.squad_members
  for insert to authenticated with check (player_id = auth.uid());

drop policy if exists "members answer squad invites" on public.squad_members;
create policy "members answer squad invites" on public.squad_members
  for update to authenticated using (player_id = auth.uid());

drop policy if exists "admins manage squad members" on public.squad_members;
create policy "admins manage squad members" on public.squad_members
  for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));


-- ========== 0014_push_subs.sql ==========
-- VIK Clan migration 0014: push subscription storage (Raven Messages).
-- Run AFTER 0013. Stores Web Push subscriptions per member; delivery
-- activates with the Phase 9 Edge Function (VAPID sender).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (player_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "members manage own push" on public.push_subscriptions;
create policy "members manage own push" on public.push_subscriptions
  for all to authenticated using (player_id = auth.uid()) with check (player_id = auth.uid());


-- ========== 0015_socials.sql ==========
-- VIK Clan migration 0015: social links on profiles.
-- Run AFTER 0014. Covered by existing "update own profile" RLS.

alter table public.profiles
  add column if not exists instagram text,
  add column if not exists tiktok text,
  add column if not exists kick text;


-- ========== 0016_gifts.sql ==========
-- VIK Clan migration 0016: GP gifts between members.
-- Run AFTER 0015.
-- 1. Ledger allows negative rows so gifts move Glory giver -> receiver.
-- 2. gp_requests tracks ask-for-Glory favors with accept/decline.

alter table public.xp_ledger drop constraint if exists xp_ledger_amount_check;
alter table public.xp_ledger add check (amount != 0);

create table if not exists public.gp_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  giver_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount >= 5 and amount <= 500),
  message text,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id != giver_id)
);
create index if not exists gp_req_giver_idx on public.gp_requests (giver_id, status);

alter table public.gp_requests enable row level security;

drop policy if exists "authenticated read gifts" on public.gp_requests;
create policy "authenticated read gifts" on public.gp_requests
  for select to authenticated using (true);

drop policy if exists "members request gifts" on public.gp_requests;
create policy "members request gifts" on public.gp_requests
  for insert to authenticated with check (requester_id = auth.uid());

drop policy if exists "parties answer gifts" on public.gp_requests;
create policy "parties answer gifts" on public.gp_requests
  for update to authenticated using (giver_id = auth.uid() or requester_id = auth.uid());

drop policy if exists "admins manage gifts" on public.gp_requests;
create policy "admins manage gifts" on public.gp_requests
  for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));


-- ========== 0017_open_mat.sql ==========
-- VIK Clan migration 0017: open friendly mat.
-- Run AFTER 0016. Open calls have no opponent yet — anyone may answer,
-- and posting alerts the whole clan.

alter table public.challenges
  add column if not exists is_open boolean not null default false;


-- ========== 0018_whatsapp.sql ==========
-- VIK Clan migration 0018: WhatsApp number on profiles.
-- Run AFTER 0017. Covered by existing "update own profile" RLS.
-- Store full international format, e.g. +212600000000.

alter table public.profiles
  add column if not exists whatsapp text;


-- ========== 0019_battle_evidence.sql ==========
-- VIK Clan migration 0019: battle evidence screenshots.
-- Run AFTER 0018. Battle results require photo proof like matches.
-- Files live in the private match-evidence bucket under battles/.

alter table public.challenges
  add column if not exists evidence_path text;


-- ========== 0020_match_notes.sql ==========
-- VIK Clan migration 0020: notes on match results.
-- Run AFTER 0019. Player comment travels with the submission;
-- moderator comment travels with a send-back. Covered by existing
-- match UPDATE policies (participants own / staff all).

alter table public.matches
  add column if not exists submission_comment text,
  add column if not exists moderation_comment text;


-- ========== 0021_call_expiry.sql ==========
-- VIK Clan migration 0021: open-call expiry.
-- Run AFTER 0020. Open calls live 24h, then auto-cancel so the mat
-- never fills with ghosts. Callers can renew (+24h) or cancel anytime.

alter table public.challenges
  add column if not exists expires_at timestamptz;


-- ========== 0022_known_name.sql ==========
-- VIK Clan migration 0022: warrior known name (e.g. "VIK Pride").
-- Run AFTER 0021. Real name = display_name (relabeled in UI).
-- eFootball name stays the exact in-game name.

alter table public.profiles
  add column if not exists known_name text;


-- ========== 0023_known_name_unique.sql ==========
-- VIK Clan migration 0023: warrior tag uniqueness.
-- Run AFTER 0022. Warrior tags must be unique case-insensitively so
-- mentions, challenges and the gallery never collide.

create unique index if not exists profiles_known_name_unique
  on public.profiles (lower(known_name))
  where known_name is not null and known_name <> '';


-- ========== 0024_achievement_images.sql ==========
-- VIK Clan migration 0024: forged badge images on achievements.
-- Run AFTER 0023. The badge forge stores the clan-assets storage path here.

alter table public.achievements
  add column if not exists image_url text;


-- ========== 0025_forfeit_claim.sql ==========
-- VIK Clan migration 0025: player-claimed forfeit on match results.
-- Run AFTER 0024. The confirming opponent may concede instead of confirming;
-- moderators accept (FORFEIT) or send back.

alter table public.matches
  add column if not exists forfeit_claimed_by uuid references public.profiles(id) on delete set null;


-- ========== 0026_quest_names.sql ==========
-- VIK Clan migration 0026: admin-switchable quest names.
-- Run AFTER 0025. Classic titles by default; Norse war words when chosen.

alter table public.clan_settings
  add column if not exists quest_names text not null default 'classic'
  check (quest_names in ('classic', 'norse'));


-- ========== 0027_registration_open.sql ==========
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


-- ========== 0028_clan_assets_policies.sql ==========
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


-- ========== 0029_tryout_requests.sql ==========
-- VIK Clan migration 0029: tryout requests (ask to join the clan).
-- Run AFTER 0028. Logged-out visitors submit a tryout request from the
-- login page (name + WhatsApp + optional note). Anyone may insert ONLY a
-- fresh PENDING request; OWNER/ADMIN read and resolve (accept/decline).

create table if not exists public.tryout_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text not null,
  note text,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'DECLINED')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tryout_requests enable row level security;

drop policy if exists "anon submit tryout" on public.tryout_requests;
create policy "anon submit tryout"
  on public.tryout_requests for insert to anon
  with check (status = 'PENDING' and char_length(name) > 0 and char_length(contact) > 0);

drop policy if exists "admins manage tryouts" on public.tryout_requests;
create policy "admins manage tryouts"
  on public.tryout_requests for all to authenticated
  using (public.is_clan_role(array['OWNER', 'ADMIN']))
  with check (public.is_clan_role(array['OWNER', 'ADMIN']));

create index if not exists tryout_requests_status_created
  on public.tryout_requests (status, created_at desc);


-- ========== 0030_tryout_notify.sql ==========
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


-- ========== 0031_tryout_verdict.sql ==========
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


-- ========== 0032_tryout_email.sql ==========
-- VIK Clan migration 0032: email on tryout requests (auto-provisioning).
-- Run AFTER 0031. The tryout form mirrors signup (name + email + WhatsApp)
-- so an accepted candidate's account can be created directly — no password
-- is ever collected or stored; the candidate sets it via Supabase invite email.
-- The existing anon-insert policy already permits the new nullable column.

alter table public.tryout_requests
  add column if not exists email text;


-- ========== 0033_round_staff.sql ==========
-- VIK Clan migration 0033: round control for staff.
-- Moderators start league/cup rounds alongside owners and admins
-- (round gating: a round opens when the previous round finishes,
-- or when staff force-starts it early).

drop policy if exists "admins manage rounds" on public.rounds;
create policy "staff manage rounds"
  on public.rounds for all to authenticated
  using (public.is_clan_role(array['OWNER', 'ADMIN', 'MODERATOR']))
  with check (public.is_clan_role(array['OWNER', 'ADMIN', 'MODERATOR']));


-- ========== 0034_rls_cheat_lockdown.sql ==========
-- VIK Clan migration 0034: RLS cheat lockdown (see docs/rls-audit.md).
-- (Body identical to app/supabase/migrations/0034_rls_cheat_lockdown.sql.)

-- ============ 0. helper (also in 0001/0028; repeated for standalone runs) ============
create or replace function public.is_clan_role(required text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = any(required) and p.status = 'ACTIVE'
  );
$$;

-- ============ F1. profiles: freeze privileged columns for non-staff ============
-- Self-writes that must keep working: updateOwnProfile allow-list,
-- swear() (oath_accepted_at), heartbeat (last_login_at).
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_clan_role(array['OWNER','ADMIN']) then
    return NEW;
  end if;
  if (NEW.role is distinct from OLD.role
      or NEW.status is distinct from OLD.status
      or NEW.username is distinct from OLD.username
      or NEW.email is distinct from OLD.email) then
    raise exception 'Only staff can change role, status, username or email.';
  end if;
  return NEW;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ============ F6. audit_logs: actors can only append as themselves ============
-- Verified: every client call site inserts actor_id = own id.
drop policy if exists "members append audit" on public.audit_logs;
create policy "members append audit" on public.audit_logs
  for insert to authenticated with check (actor_id = auth.uid());

-- ============ F2. joins: ACTIVE + oath-sworn; waitlist position server-set ============
drop policy if exists "members join competitions" on public.competition_participants;
create policy "members join competitions" on public.competition_participants
  for insert to authenticated with check (
    player_id = auth.uid()
    and exists (select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE' and p.oath_accepted_at is not null)
  );
drop policy if exists "members join waitlist" on public.competition_waitlist;
create policy "members join waitlist" on public.competition_waitlist
  for insert to authenticated with check (
    player_id = auth.uid()
    and exists (select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE' and p.oath_accepted_at is not null)
  );
-- Queue jumping is impossible: position is always assigned server-side.
create or replace function public.assign_waitlist_position()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(max(position), 0) + 1 into NEW.position
    from public.competition_waitlist
    where competition_id = NEW.competition_id;
  return NEW;
end $$;
drop trigger if exists waitlist_position on public.competition_waitlist;
create trigger waitlist_position
  before insert on public.competition_waitlist
  for each row execute function public.assign_waitlist_position();

-- ============ F3. matches: state machine for non-staff ============
drop policy if exists "players submit own matches" on public.matches;
create policy "players submit own matches" on public.matches
  for update to authenticated
  using (auth.uid() = player_a_id or auth.uid() = player_b_id
    or public.is_clan_role(array['OWNER','ADMIN','MODERATOR']))
  with check (auth.uid() = player_a_id or auth.uid() = player_b_id
    or public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));
-- Anyone may flip an expired match to OVERDUE (preserves markOverdue for
-- viewers who are neither participants nor staff; strictly deadline-gated).
drop policy if exists "anyone marks overdue" on public.matches;
create policy "anyone marks overdue" on public.matches
  for update to authenticated
  using (status in ('SCHEDULED','RESULT_SUBMITTED') and deadline is not null and deadline < now())
  with check (status = 'OVERDUE');

create or replace function public.guard_match_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  is_part boolean := (OLD.player_a_id = me or OLD.player_b_id = me);
  winner uuid := case
    when NEW.score_a is null or NEW.score_b is null then null
    when NEW.score_a > NEW.score_b then NEW.player_a_id
    when NEW.score_a < NEW.score_b then NEW.player_b_id
    else null end;
begin
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  if not is_part then
    -- Non-participants may only perform the deadline-gated overdue sweep
    -- (also covered by the "anyone marks overdue" policy above).
    if OLD.status in ('SCHEDULED','RESULT_SUBMITTED') and NEW.status = 'OVERDUE'
      and OLD.deadline is not null and OLD.deadline < now() then
      return NEW;
    end if;
    raise exception 'Only participants can update this match.';
  end if;
  -- Fixtures and staff-only columns are immutable for players.
  if (NEW.competition_id is distinct from OLD.competition_id
      or NEW.round_id is distinct from OLD.round_id
      or NEW.player_a_id is distinct from OLD.player_a_id
      or NEW.player_b_id is distinct from OLD.player_b_id
      or NEW.moderation_comment is distinct from OLD.moderation_comment
      or NEW.forfeit_player_id is distinct from OLD.forfeit_player_id) then
    raise exception 'Only staff can change fixtures or moderation state.';
  end if;
  -- 1. submit: SCHEDULED/OVERDUE -> RESULT_SUBMITTED by a participant.
  if OLD.status in ('SCHEDULED','OVERDUE') and NEW.status = 'RESULT_SUBMITTED' then
    if NEW.score_a is null or NEW.score_b is null or NEW.score_a < 0 or NEW.score_b < 0 then
      raise exception 'Scores must be whole numbers >= 0.';
    end if;
    if NEW.submitted_by is distinct from me or NEW.submitted_at is null then
      raise exception 'Submission must be attributed to you.';
    end if;
    if NEW.forfeit_claimed_by is not null
      or NEW.confirmed_by is not null or NEW.confirmed_at is not null then
      raise exception 'Only staff can confirm results.';
    end if;
    NEW.winner_id := winner;
    return NEW;
  end if;
  -- 2. opponent confirm: RESULT_SUBMITTED -> CONFIRMED by the other side.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'CONFIRMED' then
    if OLD.submitted_by is null or OLD.submitted_by = me then
      raise exception 'The submitter cannot confirm their own result.';
    end if;
    if OLD.forfeit_claimed_by is not null then
      raise exception 'Forfeit claim pending moderator review.';
    end if;
    if NEW.score_a is distinct from OLD.score_a or NEW.score_b is distinct from OLD.score_b then
      raise exception 'Scores cannot change on confirm.';
    end if;
    if NEW.confirmed_by is distinct from me or NEW.confirmed_at is null then
      raise exception 'Confirmation must be attributed to you.';
    end if;
    NEW.winner_id := winner;
    return NEW;
  end if;
  -- 3. dispute: participant flags RESULT_SUBMITTED -> DISPUTED.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'DISPUTED' then
    if NEW.score_a is distinct from OLD.score_a or NEW.score_b is distinct from OLD.score_b
      or NEW.submitted_by is distinct from OLD.submitted_by then
      raise exception 'Scores cannot change on dispute.';
    end if;
    return NEW;
  end if;
  -- 4. forfeit claim: opponent stamps forfeit_claimed_by = self.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'RESULT_SUBMITTED'
    and OLD.forfeit_claimed_by is null and NEW.forfeit_claimed_by = me
    and OLD.submitted_by is distinct from me then
    return NEW;
  end if;
  -- 5. overdue sweep by a participant viewer.
  if OLD.status in ('SCHEDULED','RESULT_SUBMITTED') and NEW.status = 'OVERDUE'
    and OLD.deadline is not null and OLD.deadline < now() then
    return NEW;
  end if;
  raise exception 'Match update not allowed.';
end $$;
drop trigger if exists matches_guard on public.matches;
create trigger matches_guard
  before update on public.matches
  for each row execute function public.guard_match_update();

-- ============ evidence/dispute spam scoping (LOW) ============
drop policy if exists "members upload evidence" on public.match_evidence;
create policy "members upload evidence" on public.match_evidence
  for insert to authenticated with check (
    uploaded_by = auth.uid()
    and exists (select 1 from public.matches m
      where m.id = match_id and (m.player_a_id = auth.uid() or m.player_b_id = auth.uid()))
  );
drop policy if exists "members open disputes" on public.disputes;
create policy "members open disputes" on public.disputes
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (select 1 from public.matches m
      where m.id = match_id and (m.player_a_id = auth.uid() or m.player_b_id = auth.uid()))
  );

-- ============ F5. challenges: insert guards + state machine ============
-- Ghost sweep by any viewer (preserves expireStaleOpenCalls).
drop policy if exists "anyone sweeps expired calls" on public.challenges;
create policy "anyone sweeps expired calls" on public.challenges
  for update to authenticated
  using (is_open = true and status = 'PENDING' and expires_at is not null and expires_at < now())
  with check (status = 'CANCELLED');

create or replace function public.guard_challenge_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  balance int := 0;
  holder uuid := null;
  dupes int := 0;
begin
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  if NEW.challenger_id is distinct from me then
    raise exception 'You can only issue challenges as yourself.';
  end if;
  if NEW.is_open = true and NEW.type != 'FRIENDLY' then
    raise exception 'Only friendlies can be open calls.';
  end if;
  if NEW.is_open = true then
    NEW.opponent_id := null;
    NEW.expires_at := now() + interval '24 hours';
  elsif NEW.opponent_id is null and (NEW.opponent_label is null or NEW.opponent_label = '') then
    raise exception 'Name an opponent.';
  end if;
  if NEW.forced = true then
    if NEW.type != 'HEAD' then
      raise exception 'Only Calls for a Head can be unrefusable.';
    end if;
    if NEW.opponent_id is null then
      raise exception 'Unrefusable calls target a clan member.';
    end if;
    select coalesce(sum(amount), 0) into balance from public.xp_ledger where player_id = me;
    if balance < 100 then
      raise exception 'Unrefusable calls require holding 100 GP.';
    end if;
  end if;
  if NEW.for_throne = true then
    if NEW.type != 'HONOR' then
      raise exception 'Throne battles must be Honor Duels.';
    end if;
    select holder_id into holder from public.throne_reigns
      where ended_at is null order by started_at desc limit 1;
    if holder is null then
      raise exception 'The throne is vacant - ask an admin to crown a champion.';
    end if;
    if NEW.opponent_id is distinct from holder then
      raise exception 'Throne challenges must target the current holder.';
    end if;
    select count(*) into dupes from public.challenges
      where challenger_id = me and for_throne = true
        and status in ('PENDING','ACCEPTED','RESULT_SUBMITTED');
    if dupes > 0 then
      raise exception 'You already have an active throne challenge — resolve it first.';
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists challenges_insert_guard on public.challenges;
create trigger challenges_insert_guard
  before insert on public.challenges
  for each row execute function public.guard_challenge_insert();

create or replace function public.guard_challenge_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  is_part boolean := (OLD.challenger_id = me or OLD.opponent_id = me);
begin
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  -- Immutable for players across every transition.
  if (NEW.challenger_id is distinct from OLD.challenger_id
      or NEW.type is distinct from OLD.type
      or NEW.forced is distinct from OLD.forced
      or NEW.for_throne is distinct from OLD.for_throne
      or NEW.opponent_label is distinct from OLD.opponent_label
      or NEW.conditions is distinct from OLD.conditions
      or NEW.stakes is distinct from OLD.stakes) then
    raise exception 'Only staff can change challenge terms.';
  end if;
  -- a. open-mat accept: first taker becomes the opponent.
  if OLD.is_open = true and OLD.status = 'PENDING' and OLD.opponent_id is null
    and NEW.status = 'ACCEPTED' and NEW.opponent_id = me and NEW.is_open = false
    and OLD.challenger_id is distinct from me then
    return NEW;
  end if;
  -- b. ghost sweep by any viewer.
  if OLD.is_open = true and OLD.status = 'PENDING'
    and OLD.expires_at is not null and OLD.expires_at < now()
    and NEW.status = 'CANCELLED' then
    return NEW;
  end if;
  if not is_part then
    raise exception 'Only participants can update this battle.';
  end if;
  -- c. respond: opponent accepts, or declines (never a forced call).
  if OLD.status = 'PENDING' and OLD.opponent_id = me
    and NEW.status in ('ACCEPTED','DECLINED')
    and (NEW.status = 'ACCEPTED' or OLD.forced = false) then
    return NEW;
  end if;
  -- d. submit: ACCEPTED -> RESULT_SUBMITTED with scores by a participant.
  if OLD.status = 'ACCEPTED' and NEW.status = 'RESULT_SUBMITTED'
    and OLD.submitted_by is null and NEW.submitted_by = me
    and NEW.score_a is not null and NEW.score_b is not null
    and NEW.score_a >= 0 and NEW.score_b >= 0 then
    return NEW;
  end if;
  -- e. confirm: RESULT_SUBMITTED -> COMPLETED by the other side.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'COMPLETED'
    and OLD.submitted_by is not null and OLD.submitted_by is distinct from me
    and NEW.score_a is not distinct from OLD.score_a
    and NEW.score_b is not distinct from OLD.score_b
    and NEW.submitted_by is not distinct from OLD.submitted_by then
    return NEW;
  end if;
  -- f. cancel: challenger anytime (PENDING/ACCEPTED); opponent only friendlies.
  if OLD.status in ('PENDING','ACCEPTED') and NEW.status = 'CANCELLED'
    and (OLD.challenger_id = me or OLD.type = 'FRIENDLY') then
    return NEW;
  end if;
  -- g. renew: caller extends their own open call.
  if OLD.challenger_id = me and OLD.is_open = true and OLD.status = 'PENDING'
    and NEW.status = 'PENDING' and NEW.expires_at > OLD.expires_at then
    return NEW;
  end if;
  raise exception 'Battle update not allowed.';
end $$;
drop trigger if exists challenges_guard on public.challenges;
create trigger challenges_guard
  before update on public.challenges
  for each row execute function public.guard_challenge_update();

-- ============ F9. ratings: no takeover, scores match dims ============
drop policy if exists "members update own rating" on public.ratings;
create policy "members update own rating" on public.ratings
  for update to authenticated
  using (rater_id = auth.uid()) with check (rater_id = auth.uid());
alter table public.ratings drop constraint if exists ratings_score_dims_check;
alter table public.ratings add check (
  tactical is null or fairplay is null or connection is null
  or score = round((tactical + fairplay + connection) / 3.0)
);

-- ============ F10. squads: no leadership transfer, no self-promote ============
drop policy if exists "leaders manage squads" on public.squads;
create policy "leaders manage squads" on public.squads
  for update to authenticated
  using (leader_id = auth.uid()) with check (leader_id = auth.uid());
create or replace function public.guard_squad_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  if NEW.player_id is distinct from OLD.player_id
    or NEW.role is distinct from OLD.role
    or NEW.squad_id is distinct from OLD.squad_id then
    raise exception 'Only staff can move warriors between squads or ranks.';
  end if;
  if OLD.player_id is distinct from auth.uid() then
    raise exception 'You can only answer your own squad invite.';
  end if;
  if OLD.status = 'PENDING' and NEW.status in ('ACCEPTED','DECLINED') then
    return NEW;
  end if;
  raise exception 'Squad update not allowed.';
end $$;
drop trigger if exists squad_members_guard on public.squad_members;
create trigger squad_members_guard
  before update on public.squad_members
  for each row execute function public.guard_squad_member_update();

-- ============ F11/F7/F8. economy writes move behind RPCs ============
drop policy if exists "parties answer gifts" on public.gp_requests;
drop policy if exists "members earn xp" on public.xp_ledger;
drop policy if exists "members claim quests" on public.quest_claims;

-- ============ F12. tryouts: testers touch verdict columns only ============
drop policy if exists "anon submit tryout" on public.tryout_requests;
create policy "anon submit tryout"
  on public.tryout_requests for insert to anon, authenticated
  with check (status = 'PENDING' and char_length(name) > 0 and char_length(contact) > 0);
create or replace function public.guard_tryout_verdict()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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

-- ============ F13. avatars: everyone reads, owners write ============
drop policy if exists "members manage own avatar" on storage.objects;
-- SELECT ("members read avatars") and clan-assets policies are untouched.
create policy "members upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "members update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy "members delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ secured economy RPCs (SECURITY DEFINER) ============
-- Shared season label: S<year>.
create or replace function public.vik_season()
returns text language sql stable set search_path = public as $$
  select 'S' || extract(year from now())::text;
$$;

-- Match rewards: winner 30 / draw 15 / loser 10 + First Blood + streaks.
-- Same reasons, names and notices as the client code it replaces.
create or replace function public.grant_match_rewards(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
  a_won boolean; is_draw boolean;
  pid uuid;
  verified int;
  streak int := 0; longest int := 0;
  r record;
  mine int; theirs int;
begin
  select * into m from public.matches where id = p_match_id;
  if m is null then raise exception 'Match not found.'; end if;
  if m.status not in ('CONFIRMED','FORFEIT') then
    raise exception 'Match is not final.';
  end if;
  if m.score_a is null or m.score_b is null then
    raise exception 'Match has no score.';
  end if;
  if auth.uid() is distinct from m.player_a_id
    and auth.uid() is distinct from m.player_b_id
    and not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only participants can settle rewards.';
  end if;
  a_won := m.score_a > m.score_b;
  is_draw := m.score_a = m.score_b;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (m.player_a_id, case when a_won then 30 when is_draw then 15 else 10 end,
      case when a_won then 'match-win' when is_draw then 'match-draw' else 'match-played' end,
      'match', m.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (m.player_b_id, case when not a_won and not is_draw then 30 when is_draw then 15 else 10 end,
      case when not a_won and not is_draw then 'match-win' when is_draw then 'match-draw' else 'match-played' end,
      'match', m.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  foreach pid in array array[m.player_a_id, m.player_b_id] loop
    select count(*) into verified from (
      select 1 from public.matches
        where (player_a_id = pid or player_b_id = pid)
          and status in ('CONFIRMED','FORFEIT')
      union all
      select 1 from public.challenges
        where (challenger_id = pid or opponent_id = pid) and status = 'COMPLETED'
    ) s;
    if verified = 1 and not exists (
        select 1 from public.achievements where player_id = pid and type = 'FIRST_BLOOD') then
      insert into public.achievements (player_id, competition_id, type, name, description)
        values (pid, m.competition_id, 'FIRST_BLOOD', 'First Blood', 'Completed first verified clan match.');
      insert into public.notifications (user_id, type, title, message)
        values (pid, 'COMPETITION_FINISHED', 'Achievement: First Blood', 'You completed your first verified clan match.');
    end if;
    streak := 0; longest := 0;
    for r in select player_a_id, player_b_id, score_a, score_b from public.matches
        where (player_a_id = pid or player_b_id = pid)
          and status in ('CONFIRMED','FORFEIT')
        order by confirmed_at asc nulls last loop
      if r.score_a is null or r.score_b is null then continue; end if;
      mine := case when r.player_a_id = pid then r.score_a else r.score_b end;
      theirs := case when r.player_a_id = pid then r.score_b else r.score_a end;
      if mine > theirs then streak := streak + 1; longest := greatest(longest, streak);
      else streak := 0; end if;
    end loop;
    if longest >= 5 and not exists (
        select 1 from public.achievements where player_id = pid and type = 'STREAK_5') then
      insert into public.achievements (player_id, competition_id, type, name, description)
        values (pid, m.competition_id, 'STREAK_5', 'War Streak x5', 'Consecutive verified wins.');
      insert into public.notifications (user_id, type, title, message)
        values (pid, 'COMPETITION_FINISHED', 'Badge: War Streak x5', 'A new battle honor is yours.');
    end if;
    if longest >= 10 and not exists (
        select 1 from public.achievements where player_id = pid and type = 'STREAK_10') then
      insert into public.achievements (player_id, competition_id, type, name, description)
        values (pid, m.competition_id, 'STREAK_10', 'Unbroken x10', 'Consecutive verified wins.');
      insert into public.notifications (user_id, type, title, message)
        values (pid, 'COMPETITION_FINISHED', 'Badge: Unbroken x10', 'A new battle honor is yours.');
    end if;
  end loop;
end $$;
revoke all on function public.grant_match_rewards(uuid) from public;
grant execute on function public.grant_match_rewards(uuid) to authenticated;

-- Battle rewards: winner 25 / draw 15 / loser 10 + 100 bounty on forced calls.
create or replace function public.grant_battle_rewards(p_challenge_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  a_won boolean; is_draw boolean;
  opp uuid;
  winner uuid;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if c is null then raise exception 'Battle not found.'; end if;
  if c.status != 'COMPLETED' then raise exception 'Battle is not final.'; end if;
  if auth.uid() is distinct from c.challenger_id
    and (c.opponent_id is null or auth.uid() is distinct from c.opponent_id)
    and not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only participants can settle rewards.';
  end if;
  a_won := c.score_a > c.score_b;
  is_draw := c.score_a = c.score_b;
  opp := c.opponent_id;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (c.challenger_id, case when a_won then 25 when is_draw then 15 else 10 end,
      'battle', 'battle', c.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  if opp is not null then
    insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
      values (opp, case when not a_won and not is_draw then 25 when is_draw then 15 else 10 end,
        'battle', 'battle', c.id::text, public.vik_season())
      on conflict (player_id, ref_type, ref_id, reason) do nothing;
  end if;
  if c.forced = true and not is_draw then
    winner := case when a_won then c.challenger_id else opp end;
    if winner is not null then
      insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
        values (winner, 100, 'bounty', 'battle', c.id::text, public.vik_season())
        on conflict (player_id, ref_type, ref_id, reason) do nothing;
    end if;
  end if;
end $$;
revoke all on function public.grant_battle_rewards(uuid) from public;
grant execute on function public.grant_battle_rewards(uuid) to authenticated;

-- Quest claim: progress re-validated in SQL (Casa day / Monday boundaries).
create or replace function public.claim_quest(p_quest_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  daily text[] := array['first-blood','wanderer','caller','squire'];
  weekly text[] := array['veteran','rival'];
  kind text;
  xp int;
  v_day timestamptz := date_trunc('day', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
  v_week timestamptz := date_trunc('week', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
  since timestamptz;
  period text;
  done int := 0; target int := 1;
begin
  if p_quest_key = any(daily) then kind := 'daily';
  elsif p_quest_key = any(weekly) then kind := 'weekly';
  else raise exception 'Unknown quest.'; end if;
  if kind = 'daily' then
    since := v_day; period := (v_day at time zone 'Africa/Casablanca')::date::text;
  else
    since := v_week; period := (v_week at time zone 'Africa/Casablanca')::date::text;
  end if;
  case p_quest_key
    when 'first-blood' then xp := 30; target := 1;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since;
      done := least(done, 1);
    when 'wanderer' then xp := 60; target := 2;
      select count(*) into done from (
        select distinct case when player_a_id = me then player_b_id else player_a_id end
        from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since
      ) s;
      done := least(done, 2);
    when 'caller' then xp := 15; target := 1;
      select count(*) into done from public.challenges
        where challenger_id = me and created_at >= since;
      done := least(done, 1);
    when 'squire' then xp := 20; target := 1;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT')
          and confirmed_by = me and confirmed_at >= since;
      done := least(done, 1);
    when 'veteran' then xp := 80; target := 3;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since;
      done := least(done, 3);
    when 'rival' then xp := 50; target := 1;
      select count(*) into done from public.challenges
        where type = 'REMATCH' and (challenger_id = me or opponent_id = me)
          and created_at >= since;
      done := least(done, 1);
  end case;
  if done < target then raise exception 'Quest not complete yet.'; end if;
  begin
    insert into public.quest_claims (player_id, quest_key, period)
      values (me, p_quest_key, period);
  exception when unique_violation then
    raise exception 'Already claimed.';
  end;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (me, xp, 'quest:' || p_quest_key, 'quest', p_quest_key || ':' || period, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
end $$;
revoke all on function public.claim_quest(text) from public;
grant execute on function public.claim_quest(text) to authenticated;

-- Gift answer: balance-checked paired transfer, giver only.
create or replace function public.answer_gift(p_request_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  g record;
  balance int;
begin
  select * into g from public.gp_requests where id = p_request_id;
  if g is null then raise exception 'Request not found.'; end if;
  if g.status != 'PENDING' then raise exception 'Already answered.'; end if;
  if auth.uid() is distinct from g.giver_id then
    raise exception 'Only the giver can answer.';
  end if;
  if not p_accept then
    update public.gp_requests set status = 'DECLINED', responded_at = now() where id = p_request_id;
    insert into public.notifications (user_id, type, title, message)
      values (g.requester_id, 'COMPETITION_FINISHED', 'Favor declined', 'They refused the Glory request.');
    return;
  end if;
  select coalesce(sum(amount), 0) into balance from public.xp_ledger where player_id = g.giver_id;
  if balance < g.amount then
    raise exception 'Not enough Glory (holds % GP).', balance;
  end if;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (g.giver_id, -g.amount, 'gift-sent', 'gift', g.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (g.requester_id, g.amount, 'gift-received', 'gift', g.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  update public.gp_requests set status = 'ACCEPTED', responded_at = now() where id = p_request_id;
  insert into public.notifications (user_id, type, title, message)
    values (g.requester_id, 'COMPETITION_FINISHED',
      '+' || g.amount || ' Glory received', 'Your brother answered your call.');
end $$;
revoke all on function public.answer_gift(uuid, boolean) from public;
grant execute on function public.answer_gift(uuid, boolean) to authenticated;

-- Onboarding reward: +80 once the name/tag/phone gate is complete.
create or replace function public.claim_onboarding_reward()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  ok boolean;
begin
  select (display_name is not null and display_name != ''
    and known_name is not null and known_name != ''
    and whatsapp is not null and whatsapp != '')
    into ok from public.profiles where id = me;
  if coalesce(ok, false) = false then
    raise exception 'Complete your name, warrior tag and phone first.';
  end if;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (me, 80, 'onboarding-profile', 'onboarding', me::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  return true;
end $$;
revoke all on function public.claim_onboarding_reward() from public;
grant execute on function public.claim_onboarding_reward() to authenticated;

-- Throne settle: validated transfer/defense, pledges follow the throne.
-- Replaces the client-side settle (which RLS denied for non-staff).
create or replace function public.settle_throne_battle(p_challenge_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  c record;
  reign record;
  winner uuid;
  now_ts timestamptz := now();
  s record;
  moved int := 0;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if c is null then raise exception 'Battle not found.'; end if;
  if c.status != 'COMPLETED' or c.for_throne != true then
    raise exception 'Not a completed throne battle.';
  end if;
  if c.score_a is null or c.score_b is null or c.opponent_id is null then
    raise exception 'Throne battle has no score.';
  end if;
  if auth.uid() is distinct from c.challenger_id
    and auth.uid() is distinct from c.opponent_id
    and not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only participants can settle the throne.';
  end if;
  select * into reign from public.throne_reigns
    where ended_at is null order by started_at desc limit 1;
  if reign is null or reign.holder_id is distinct from c.opponent_id then
    return 'draw';
  end if;
  winner := case
    when c.score_a > c.score_b then c.challenger_id
    when c.score_b > c.score_a then c.opponent_id
    else null end;
  if winner is null or winner = reign.holder_id then
    update public.throne_reigns set defenses = reign.defenses + 1 where id = reign.id;
    return case when winner is not null then 'defended' else 'draw' end;
  end if;
  update public.throne_reigns set ended_at = now_ts where id = reign.id;
  insert into public.throne_reigns (holder_id, won_from)
    values (c.challenger_id, reign.holder_id);
  for s in select id, challenger_id from public.challenges
      where for_throne = true and opponent_id = reign.holder_id
        and status in ('PENDING','ACCEPTED')
        and challenger_id is distinct from c.challenger_id loop
    update public.challenges
      set opponent_id = c.challenger_id, status = 'PENDING',
        responded_at = null, updated_at = now_ts
      where id = s.id;
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
      values (s.challenger_id, 'COMPETITION_INVITATION', 'Pledge redirected',
        'The throne changed hands — your challenge now targets the new champion.',
        'battle', s.id);
    moved := moved + 1;
  end loop;
  if moved > 0 then
    insert into public.notifications (user_id, type, title, message)
      values (c.challenger_id, 'COMPETITION_INVITATION', 'Throne pledges incoming',
        'Redirected challenges await your answer as the new champion.');
  end if;
  return 'transfer';
end $$;
revoke all on function public.settle_throne_battle(uuid) from public;
grant execute on function public.settle_throne_battle(uuid) to authenticated;

-- ============ TODO (kept open; later RPC tasks, see docs/rls-audit.md §4) ============
-- notifications INSERT stays open (central notify() used by every flow).
-- squad invites by non-staff leaders still fail RLS (needs create_squad RPC).
-- match-evidence storage uploads stay any-path (row gate above is the check).


-- ========== 0035_server_confirm.sql ==========
-- VIK Clan migration 0035: server-side match confirmation.
-- (Body identical to app/supabase/migrations/0035_server_confirm.sql.)

-- Shared finalizer. NOT exposed: execute revoked so it is only reachable
-- through the three public wrappers below (same-transaction calls inherit
-- the wrapper's definer rights for the permission check).
create or replace function public.vik_finalize_match(
  p_match_id uuid,
  p_status text,
  p_score_a int,
  p_score_b int,
  p_confirmed_by uuid,
  p_forfeit_player uuid,
  p_audit_action text,
  p_audit_new jsonb,
  p_audit_reason text,
  p_notice_title text,
  p_notice_msg text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  m record;
  winner uuid;
  pid uuid;
  verified int;
  streak int := 0;
  longest int := 0;
  r record;
  open_n int;
  cur_rn int;
  next_id uuid := null;
  round_complete boolean := false;
begin
  select * into m from public.matches where id = p_match_id;
  if m is null then raise exception 'Match not found.'; end if;
  winner := case
    when p_score_a > p_score_b then m.player_a_id
    when p_score_a < p_score_b then m.player_b_id
    else null end;
  update public.matches
    set status = p_status,
      score_a = p_score_a,
      score_b = p_score_b,
      confirmed_by = p_confirmed_by,
      confirmed_at = now(),
      winner_id = winner,
      forfeit_player_id = p_forfeit_player,
      forfeit_claimed_by = null,
      updated_at = now()
    where id = p_match_id;
  -- Glory: winner 30 / draw 15 / loser 10, idempotent per (player, ref, reason).
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (m.player_a_id,
      case when p_score_a > p_score_b then 30 when p_score_a = p_score_b then 15 else 10 end,
      case when p_score_a > p_score_b then 'match-win' when p_score_a = p_score_b then 'match-draw' else 'match-played' end,
      'match', p_match_id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (m.player_b_id,
      case when p_score_b > p_score_a then 30 when p_score_a = p_score_b then 15 else 10 end,
      case when p_score_b > p_score_a then 'match-win' when p_score_a = p_score_b then 'match-draw' else 'match-played' end,
      'match', p_match_id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  -- First Blood + win streaks over matches AND battles.
  foreach pid in array array[m.player_a_id, m.player_b_id] loop
    select count(*) into verified from (
      select 1 from public.matches
        where (player_a_id = pid or player_b_id = pid)
          and status in ('CONFIRMED','FORFEIT')
      union all
      select 1 from public.challenges
        where (challenger_id = pid or opponent_id = pid) and status = 'COMPLETED'
    ) s;
    if verified = 1 and not exists (
        select 1 from public.achievements where player_id = pid and type = 'FIRST_BLOOD') then
      insert into public.achievements (player_id, competition_id, type, name, description)
        values (pid, m.competition_id, 'FIRST_BLOOD', 'First Blood', 'Completed first verified clan match.');
      insert into public.notifications (user_id, type, title, message)
        values (pid, 'COMPETITION_FINISHED', 'Achievement: First Blood', 'You completed your first verified clan match.');
    end if;
    streak := 0;
    longest := 0;
    for r in
      select played_at, mine, theirs from (
        select confirmed_at as played_at,
          case when player_a_id = pid then score_a else score_b end as mine,
          case when player_a_id = pid then score_b else score_a end as theirs
        from public.matches
        where (player_a_id = pid or player_b_id = pid)
          and status in ('CONFIRMED','FORFEIT')
          and score_a is not null and score_b is not null
        union all
        select updated_at as played_at,
          case when challenger_id = pid then score_a else score_b end as mine,
          case when challenger_id = pid then score_b else score_a end as theirs
        from public.challenges
        where (challenger_id = pid or opponent_id = pid) and status = 'COMPLETED'
          and score_a is not null and score_b is not null and opponent_id is not null
      ) s order by played_at asc nulls last
    loop
      if r.mine > r.theirs then
        streak := streak + 1;
        longest := greatest(longest, streak);
      else
        streak := 0;
      end if;
    end loop;
    if longest >= 5 and not exists (
        select 1 from public.achievements where player_id = pid and type = 'STREAK_5') then
      insert into public.achievements (player_id, competition_id, type, name, description)
        values (pid, m.competition_id, 'STREAK_5', 'War Streak x5', 'Consecutive verified wins.');
      insert into public.notifications (user_id, type, title, message)
        values (pid, 'COMPETITION_FINISHED', 'Badge: War Streak x5', 'A new battle honor is yours.');
    end if;
    if longest >= 10 and not exists (
        select 1 from public.achievements where player_id = pid and type = 'STREAK_10') then
      insert into public.achievements (player_id, competition_id, type, name, description)
        values (pid, m.competition_id, 'STREAK_10', 'Unbroken x10', 'Consecutive verified wins.');
      insert into public.notifications (user_id, type, title, message)
        values (pid, 'COMPETITION_FINISHED', 'Badge: Unbroken x10', 'A new battle honor is yours.');
    end if;
  end loop;
  -- Round advance: close the round when every match is final, open the next.
  if m.round_id is not null then
    select count(*) into open_n from public.matches
      where competition_id = m.competition_id and round_id = m.round_id
        and status not in ('CONFIRMED','FORFEIT','CANCELLED');
    if open_n = 0 then
      update public.rounds set status = 'COMPLETED'
        where id = m.round_id and status != 'COMPLETED';
      select round_number into cur_rn from public.rounds where id = m.round_id;
      select id into next_id from public.rounds
        where competition_id = m.competition_id and round_number > cur_rn
        order by round_number asc limit 1;
      if next_id is not null then
        update public.rounds set status = 'ACTIVE'
          where id = next_id and status = 'SCHEDULED';
      end if;
      round_complete := true;
    end if;
  end if;
  -- Submitter notice (skipped for staff-set results with no submitter).
  if m.submitted_by is not null and m.submitted_by is distinct from p_confirmed_by then
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
      values (m.submitted_by, 'RESULT_CONFIRMED', p_notice_title, p_notice_msg, 'match', p_match_id);
  end if;
  -- Staff audit for the staff paths (actor = caller; complies with 0034 rule).
  if p_audit_action is not null then
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_data, reason)
      values (auth.uid(), p_audit_action, 'match', p_match_id, p_audit_new, p_audit_reason);
  end if;
  return round_complete;
end $$;
revoke all on function public.vik_finalize_match(uuid, text, int, int, uuid, uuid, text, jsonb, text, text, text) from public;
revoke all on function public.vik_finalize_match(uuid, text, int, int, uuid, uuid, text, jsonb, text, text, text) from anon;
revoke all on function public.vik_finalize_match(uuid, text, int, int, uuid, uuid, text, jsonb, text, text, text) from authenticated;

-- Opponent confirm: RESULT_SUBMITTED -> CONFIRMED with everything attached.
create or replace function public.confirm_match(p_match_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  m record;
  me uuid := auth.uid();
begin
  select * into m from public.matches where id = p_match_id for update;
  if m is null then raise exception 'Match not found.'; end if;
  if m.status != 'RESULT_SUBMITTED' then raise exception 'Nothing to confirm.'; end if;
  if m.forfeit_claimed_by is not null then
    raise exception 'Forfeit claim pending moderator review.';
  end if;
  if m.submitted_by is null or m.submitted_by = me then
    raise exception 'The submitter cannot confirm their own result — opponent must confirm.';
  end if;
  if me is distinct from m.player_a_id and me is distinct from m.player_b_id
    and not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only the opponent can confirm.';
  end if;
  if m.score_a is null or m.score_b is null then
    raise exception 'Match has no score.';
  end if;
  return public.vik_finalize_match(
    m.id, 'CONFIRMED', m.score_a, m.score_b, me, null,
    null, null, null,
    'Result confirmed',
    'Your ' || m.score_a || '–' || m.score_b || ' result was confirmed. Standings updated.');
end $$;
revoke all on function public.confirm_match(uuid) from public;
grant execute on function public.confirm_match(uuid) to authenticated;

-- Staff set-result (moderator review card, dispute resolution).
create or replace function public.admin_set_result(
  p_match_id uuid, p_score_a int, p_score_b int, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  m record;
begin
  if not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only staff can set results.';
  end if;
  if p_score_a is null or p_score_b is null or p_score_a < 0 or p_score_b < 0 then
    raise exception 'Scores must be whole numbers >= 0.';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if m is null then raise exception 'Match not found.'; end if;
  return public.vik_finalize_match(
    m.id, 'CONFIRMED', p_score_a, p_score_b, auth.uid(), null,
    'ADMIN_CHANGED_MATCH_RESULT',
    jsonb_build_object('scoreA', p_score_a, 'scoreB', p_score_b),
    coalesce(p_reason, 'dispute resolution'),
    'Result confirmed',
    'A moderator recorded your result ' || p_score_a || '–' || p_score_b || '. Standings updated.');
end $$;
revoke all on function public.admin_set_result(uuid, int, int, text) from public;
grant execute on function public.admin_set_result(uuid, int, int, text) to authenticated;

-- Staff forfeit (default 3–0 walkover to the winner).
create or replace function public.award_match_forfeit(
  p_match_id uuid, p_winner_id uuid, p_reason text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  m record;
  loser uuid;
  sa int;
  sb int;
begin
  if not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only staff can award forfeits.';
  end if;
  select * into m from public.matches where id = p_match_id for update;
  if m is null then raise exception 'Match not found.'; end if;
  if p_winner_id is distinct from m.player_a_id and p_winner_id is distinct from m.player_b_id then
    raise exception 'Winner must be a participant.';
  end if;
  loser := case when p_winner_id = m.player_a_id then m.player_b_id else m.player_a_id end;
  sa := case when p_winner_id = m.player_a_id then 3 else 0 end;
  sb := case when p_winner_id = m.player_b_id then 3 else 0 end;
  return public.vik_finalize_match(
    m.id, 'FORFEIT', sa, sb, auth.uid(), loser,
    'ADMIN_AWARDED_FORFEIT',
    jsonb_build_object('winnerId', p_winner_id, 'loserId', loser),
    p_reason,
    'Result confirmed',
    'Forfeit recorded: ' || sa || '–' || sb || ' walkover. Standings updated.');
end $$;
revoke all on function public.award_match_forfeit(uuid, uuid, text) from public;
grant execute on function public.award_match_forfeit(uuid, uuid, text) to authenticated;


-- ========== 0036_auto_jarl.sql ==========
-- VIK Clan migration 0036: Auto-Jarl (pg_cron background automation).
-- (Body identical to app/supabase/migrations/0036_auto_jarl.sql.)

create extension if not exists pg_cron;

-- ============ settings columns (Admin > Access toggles) ============
alter table public.clan_settings
  add column if not exists auto_jarl_enabled boolean not null default true,
  add column if not exists auto_confirm_hours int not null default 48,
  add column if not exists overdue_grace_hours int not null default 48,
  add column if not exists forfeit_mode text not null default 'manual';
do $$ begin
  alter table public.clan_settings add check (auto_confirm_hours >= 1);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clan_settings add check (overdue_grace_hours >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clan_settings add check (forfeit_mode in ('auto','manual'));
exception when duplicate_object then null; end $$;

-- ============ reminder markers (server-only table, no client policies) ============
create table if not exists public.match_reminders (
  match_id uuid primary key references public.matches(id) on delete cascade,
  warned_24h_at timestamptz,
  warned_3h_at timestamptz
);
alter table public.match_reminders enable row level security;

-- ============ cron path through the 0034 match guard ============
-- Re-states guard_match_update with one addition: auth.uid() IS NULL means
-- server-side background work (pg_cron / definer RPCs) — no JWT exists there.
-- API callers always carry a JWT and anon is excluded by policy, so this
-- branch is unreachable through the public anon key.
create or replace function public.guard_match_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  is_part boolean := (OLD.player_a_id = me or OLD.player_b_id = me);
  winner uuid := case
    when NEW.score_a is null or NEW.score_b is null then null
    when NEW.score_a > NEW.score_b then NEW.player_a_id
    when NEW.score_a < NEW.score_b then NEW.player_b_id
    else null end;
begin
  if me is null then
    return NEW;
  end if;
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return NEW;
  end if;
  if not is_part then
    -- Non-participants may only perform the deadline-gated overdue sweep
    -- (also covered by the "anyone marks overdue" policy above).
    if OLD.status in ('SCHEDULED','RESULT_SUBMITTED') and NEW.status = 'OVERDUE'
      and OLD.deadline is not null and OLD.deadline < now() then
      return NEW;
    end if;
    raise exception 'Only participants can update this match.';
  end if;
  -- Fixtures and staff-only columns are immutable for players.
  if (NEW.competition_id is distinct from OLD.competition_id
      or NEW.round_id is distinct from OLD.round_id
      or NEW.player_a_id is distinct from OLD.player_a_id
      or NEW.player_b_id is distinct from OLD.player_b_id
      or NEW.moderation_comment is distinct from OLD.moderation_comment
      or NEW.forfeit_player_id is distinct from OLD.forfeit_player_id) then
    raise exception 'Only staff can change fixtures or moderation state.';
  end if;
  -- 1. submit: SCHEDULED/OVERDUE -> RESULT_SUBMITTED by a participant.
  if OLD.status in ('SCHEDULED','OVERDUE') and NEW.status = 'RESULT_SUBMITTED' then
    if NEW.score_a is null or NEW.score_b is null or NEW.score_a < 0 or NEW.score_b < 0 then
      raise exception 'Scores must be whole numbers >= 0.';
    end if;
    if NEW.submitted_by is distinct from me or NEW.submitted_at is null then
      raise exception 'Submission must be attributed to you.';
    end if;
    if NEW.forfeit_claimed_by is not null
      or NEW.confirmed_by is not null or NEW.confirmed_at is not null then
      raise exception 'Only staff can confirm results.';
    end if;
    NEW.winner_id := winner;
    return NEW;
  end if;
  -- 2. opponent confirm: RESULT_SUBMITTED -> CONFIRMED by the other side.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'CONFIRMED' then
    if OLD.submitted_by is null or OLD.submitted_by = me then
      raise exception 'The submitter cannot confirm their own result.';
    end if;
    if OLD.forfeit_claimed_by is not null then
      raise exception 'Forfeit claim pending moderator review.';
    end if;
    if NEW.score_a is distinct from OLD.score_a or NEW.score_b is distinct from OLD.score_b then
      raise exception 'Scores cannot change on confirm.';
    end if;
    if NEW.confirmed_by is distinct from me or NEW.confirmed_at is null then
      raise exception 'Confirmation must be attributed to you.';
    end if;
    NEW.winner_id := winner;
    return NEW;
  end if;
  -- 3. dispute: participant flags RESULT_SUBMITTED -> DISPUTED.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'DISPUTED' then
    if NEW.score_a is distinct from OLD.score_a or NEW.score_b is distinct from OLD.score_b
      or NEW.submitted_by is distinct from OLD.submitted_by then
      raise exception 'Scores cannot change on dispute.';
    end if;
    return NEW;
  end if;
  -- 4. forfeit claim: opponent stamps forfeit_claimed_by = self.
  if OLD.status = 'RESULT_SUBMITTED' and NEW.status = 'RESULT_SUBMITTED'
    and OLD.forfeit_claimed_by is null and NEW.forfeit_claimed_by = me
    and OLD.submitted_by is distinct from me then
    return NEW;
  end if;
  -- 5. overdue sweep by a participant viewer.
  if OLD.status in ('SCHEDULED','RESULT_SUBMITTED') and NEW.status = 'OVERDUE'
    and OLD.deadline is not null and OLD.deadline < now() then
    return NEW;
  end if;
  raise exception 'Match update not allowed.';
end $$;

-- ============ the Auto-Jarl run ============
create or replace function public.run_auto_jarl()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s record;
  m record;
  rem record;
  c record;
  w record;
  opp uuid;
  opp_name text;
  has_ev boolean;
  has_disp boolean;
  active uuid;
  loser uuid;
  parts int;
  open_n int;
  offered uuid;
  n_overdue int := 0;
  n_warn int := 0;
  n_autoconf int := 0;
  n_forfeit int := 0;
  n_cancelled int := 0;
  n_finished int := 0;
  n_offers int := 0;
begin
  select * into s from public.clan_settings limit 1;
  if s is null or coalesce(s.auto_jarl_enabled, true) = false then
    return jsonb_build_object('enabled', false);
  end if;

  -- 1. overdue sweep + notify both (the status flip is the sent-once gate).
  for m in select id, player_a_id, player_b_id from public.matches
      where status in ('SCHEDULED','RESULT_SUBMITTED') and deadline < now() loop
    update public.matches set status = 'OVERDUE', updated_at = now() where id = m.id;
    for opp in select unnest(array[m.player_a_id, m.player_b_id]) loop
      select coalesce(p.display_name, p.username, '?') into opp_name from public.profiles p
        where p.id = (case when opp = m.player_a_id then m.player_b_id else m.player_a_id end);
      insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
        values (opp, 'MATCH_OVERDUE', 'Match overdue',
          'Your match vs ' || opp_name || ' passed its deadline — play it or contact a moderator.',
          'match', m.id);
    end loop;
    n_overdue := n_overdue + 1;
  end loop;

  -- 2. deadline warnings at 24h and 3h, each sent once per match.
  for m in select id, deadline, player_a_id, player_b_id from public.matches
      where status in ('SCHEDULED','RESULT_SUBMITTED')
        and deadline > now() and deadline <= now() + interval '24 hours' loop
    insert into public.match_reminders (match_id) values (m.id)
      on conflict (match_id) do nothing;
    select * into rem from public.match_reminders where match_id = m.id;
    if rem.warned_24h_at is null then
      for opp in select unnest(array[m.player_a_id, m.player_b_id]) loop
        select coalesce(p.display_name, p.username, '?') into opp_name from public.profiles p
          where p.id = (case when opp = m.player_a_id then m.player_b_id else m.player_a_id end);
        insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
          values (opp, 'MATCH_DEADLINE_WARNING', 'Deadline in 24 hours',
            'Your match vs ' || opp_name || ' is due within 24 hours.',
            'match', m.id);
      end loop;
      update public.match_reminders set warned_24h_at = now() where match_id = m.id;
      n_warn := n_warn + 1;
    end if;
    if m.deadline <= now() + interval '3 hours' and rem.warned_3h_at is null then
      for opp in select unnest(array[m.player_a_id, m.player_b_id]) loop
        select coalesce(p.display_name, p.username, '?') into opp_name from public.profiles p
          where p.id = (case when opp = m.player_a_id then m.player_b_id else m.player_a_id end);
        insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
          values (opp, 'MATCH_DEADLINE_WARNING', 'Deadline in 3 hours',
            'Your match vs ' || opp_name || ' is due within 3 hours — play now.',
            'match', m.id);
      end loop;
      update public.match_reminders set warned_3h_at = now() where match_id = m.id;
      n_warn := n_warn + 1;
    end if;
  end loop;

  -- 3. auto-confirm silent submitted results (evidence, no claim, no open dispute).
  for m in select id, score_a, score_b, player_a_id, player_b_id, submitted_by
      from public.matches
      where status in ('RESULT_SUBMITTED','OVERDUE')
        and submitted_by is not null
        and score_a is not null and score_b is not null
        and submitted_at is not null
        and submitted_at < now() - make_interval(hours => s.auto_confirm_hours)
        and forfeit_claimed_by is null loop
    select exists(select 1 from public.match_evidence where match_id = m.id) into has_ev;
    if not has_ev then continue; end if;
    select exists(select 1 from public.disputes
      where match_id = m.id and status in ('OPEN','UNDER_REVIEW')) into has_disp;
    if has_disp then continue; end if;
    perform public.vik_finalize_match(
      m.id, 'CONFIRMED', m.score_a, m.score_b, null, null,
      'AUTO_CONFIRMED',
      jsonb_build_object('auto', true, 'silentHours', s.auto_confirm_hours),
      'Silent result with evidence auto-confirmed.',
      'Result confirmed',
      'Your ' || m.score_a || '–' || m.score_b || ' result was confirmed. Standings updated.');
    opp := case when m.submitted_by = m.player_a_id then m.player_b_id else m.player_a_id end;
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
      values (opp, 'RESULT_CONFIRMED', 'Result confirmed',
        'Your opponent went silent — the submitted ' || m.score_a || '–' || m.score_b
        || ' stands after ' || s.auto_confirm_hours || 'h.',
        'match', m.id);
    n_autoconf := n_autoconf + 1;
  end loop;

  -- 4. forfeit rule (auto mode only) past the grace period.
  if s.forfeit_mode = 'auto' then
    for m in select id, player_a_id, player_b_id, submitted_by, forfeit_claimed_by
        from public.matches
        where status = 'OVERDUE' and deadline < now() - make_interval(hours => s.overdue_grace_hours) loop
      if m.forfeit_claimed_by is not null then
        -- Claimant conceded: the other warrior takes it.
        active := case when m.forfeit_claimed_by = m.player_a_id then m.player_b_id else m.player_a_id end;
      elsif m.submitted_by is not null then
        -- One side played, the other never answered.
        active := m.submitted_by;
      else
        -- Both silent: cancel, no Glory either way.
        update public.matches set status = 'CANCELLED', updated_at = now() where id = m.id;
        for opp in select unnest(array[m.player_a_id, m.player_b_id]) loop
          insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
            values (opp, 'MATCH_OVERDUE', 'Match cancelled',
              'Neither warrior answered — the tie is cancelled. No Glory awarded.',
              'match', m.id);
        end loop;
        n_cancelled := n_cancelled + 1;
        continue;
      end if;
      loser := case when active = m.player_a_id then m.player_b_id else m.player_a_id end;
      perform public.vik_finalize_match(
        m.id, 'FORFEIT',
        case when active = m.player_a_id then 3 else 0 end,
        case when active = m.player_b_id then 3 else 0 end,
        null, loser,
        'AUTO_FORFEIT',
        jsonb_build_object('auto', true, 'winnerId', active, 'loserId', loser),
        'Overdue grace expired, one side silent.',
        'Result confirmed',
        'Forfeit recorded: 3–0 walkover. Standings updated.');
      insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
        values (loser, 'MATCH_OVERDUE', 'Forfeit recorded',
          'You never answered — a 3–0 forfeit was recorded against you.',
          'match', m.id);
      n_forfeit := n_forfeit + 1;
    end loop;
  end if;

  -- 5. auto-finish competitions past end_date with everything final.
  for c in select id from public.competitions
      where status = 'ACTIVE' and is_deleted = false
        and end_date is not null and end_date < now() loop
    select count(*) into open_n from public.matches
      where competition_id = c.id and status not in ('CONFIRMED','FORFEIT','CANCELLED');
    if open_n = 0 then
      update public.competitions set status = 'FINISHED', updated_at = now() where id = c.id;
      n_finished := n_finished + 1;
    end if;
  end loop;

  -- 6a. waitlist hygiene: anyone who already joined stops waiting.
  update public.competition_waitlist w set status = 'ACCEPTED'
    where w.status in ('WAITING','OFFERED','EXPIRED')
      and exists (select 1 from public.competition_participants p
        where p.competition_id = w.competition_id and p.player_id = w.player_id);
  -- 6b. expire stale offers.
  update public.competition_waitlist set status = 'EXPIRED'
    where status = 'OFFERED' and expires_at is not null and expires_at < now();
  -- 6c. offer the head of the line where a slot is free and no live offer.
  for c in select id, max_players, registration_deadline from public.competitions
      where status = 'REGISTRATION_OPEN' and is_deleted = false
        and (registration_deadline is null or registration_deadline > now()) loop
    select count(*) into parts from public.competition_participants
      where competition_id = c.id;
    if parts >= c.max_players then continue; end if;
    select id into offered from public.competition_waitlist
      where competition_id = c.id and status = 'OFFERED' limit 1;
    if offered is not null then continue; end if;
    select q.id, q.player_id into w from public.competition_waitlist q
      where q.competition_id = c.id and q.status = 'WAITING'
        and not exists (select 1 from public.competition_participants p
          where p.competition_id = c.id and p.player_id = q.player_id)
      order by q.position asc limit 1;
    if w.id is null then continue; end if;
    update public.competition_waitlist
      set status = 'OFFERED', expires_at = now() + interval '24 hours'
      where id = w.id;
    insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
      values (w.player_id, 'WAITLIST_AVAILABLE', 'A slot opened',
        'A competition slot opened for you — join within 24 hours.',
        'competition', c.id);
    n_offers := n_offers + 1;
  end loop;

  return jsonb_build_object(
    'enabled', true, 'overdue', n_overdue, 'warnings', n_warn,
    'autoConfirmed', n_autoconf, 'forfeits', n_forfeit, 'cancelled', n_cancelled,
    'finished', n_finished, 'offers', n_offers);
end $$;
revoke all on function public.run_auto_jarl() from public;

-- ============ every-15-minutes schedule (idempotent re-register) ============
do $$ begin
  perform cron.unschedule('vik-auto-jarl');
exception when others then null; end $$;
select cron.schedule('vik-auto-jarl', '*/15 * * * *', 'select public.run_auto_jarl();');


-- ========== 0037_capacity_balances.sql ==========
-- VIK Clan migration 0037: server-side capacity + balances.
-- (Body identical to app/supabase/migrations/0037_capacity_balances.sql.)

-- ============ join: everything validated under lock ============
create or replace function public.join_competition(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  code text := upper(trim(coalesce(p_code, '')));
  prof record;
  c record;
  cnt int;
  already boolean;
begin
  if me is null then raise exception 'Not logged in.'; end if;
  if code = '' then raise exception 'Competition not found.'; end if;
  select * into prof from public.profiles where id = me;
  if prof is null or prof.status != 'ACTIVE' then
    raise exception 'Only ACTIVE clan members can join competitions (Rule 2).';
  end if;
  if prof.oath_accepted_at is null then
    raise exception 'Swear the Viking Oath before joining competitions.';
  end if;
  select * into c from public.competitions
    where join_code = code and is_deleted = false for update;
  if c is null then raise exception 'Competition not found.'; end if;
  if c.join_enabled = false or c.status != 'REGISTRATION_OPEN' then
    raise exception 'Registration is closed for this competition.';
  end if;
  if c.registration_start is not null and c.registration_start > now() then
    raise exception 'Registration is closed for this competition.';
  end if;
  if c.registration_deadline is not null and c.registration_deadline < now() then
    raise exception 'Registration is closed for this competition.';
  end if;
  select exists(select 1 from public.competition_participants
    where competition_id = c.id and player_id = me) into already;
  if already then
    raise exception 'You are already registered for this competition.';
  end if;
  -- Fresh count under the row lock: the loser of a last-slot race blocks
  -- here, then sees the winner's committed row.
  select count(*) into cnt from public.competition_participants
    where competition_id = c.id;
  if cnt >= c.max_players then
    return jsonb_build_object('ok', false, 'code', 'COMPETITION_FULL',
      'registered', cnt, 'max', c.max_players);
  end if;
  begin
    insert into public.competition_participants (competition_id, player_id)
      values (c.id, me);
  exception when unique_violation then
    raise exception 'You are already registered for this competition.';
  end;
  return jsonb_build_object('ok', true, 'competition_id', c.id,
    'registered', cnt + 1, 'max', c.max_players);
end $$;
revoke all on function public.join_competition(text) from public;
grant execute on function public.join_competition(text) to authenticated;

-- ============ leave: members only before start ============
create or replace function public.leave_competition(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c record;
  gone boolean;
begin
  if me is null then raise exception 'Not logged in.'; end if;
  select * into c from public.competitions
    where id = p_competition_id and is_deleted = false for update;
  if c is null then raise exception 'Competition not found.'; end if;
  if c.status in ('ACTIVE','FINISHED','ARCHIVED') then
    raise exception 'This competition has started — ask a moderator to replace you.';
  end if;
  delete from public.competition_participants
    where competition_id = c.id and player_id = me
    returning true into gone;
  if coalesce(gone, false) = false then
    raise exception 'You are not registered for this competition.';
  end if;
  return jsonb_build_object('ok', true, 'competition_id', c.id);
end $$;
revoke all on function public.leave_competition(uuid) from public;
grant execute on function public.leave_competition(uuid) to authenticated;

-- ============ answer_gift, re-stated with serialization locks ============
-- Same contract + messages as 0034, plus: the request row and the giver's
-- profile row are locked, so two concurrent accepts (double-click / two tabs)
-- serialize — the loser sees 'Already answered.' and the paired ledger rows
-- are written once. Balances can never go negative through gifts.
create or replace function public.answer_gift(p_request_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  g record;
  balance int;
begin
  select * into g from public.gp_requests where id = p_request_id for update;
  if g is null then raise exception 'Request not found.'; end if;
  if g.status != 'PENDING' then raise exception 'Already answered.'; end if;
  if auth.uid() is distinct from g.giver_id then
    raise exception 'Only the giver can answer.';
  end if;
  if not p_accept then
    update public.gp_requests set status = 'DECLINED', responded_at = now() where id = p_request_id;
    insert into public.notifications (user_id, type, title, message)
      values (g.requester_id, 'COMPETITION_FINISHED', 'Favor declined', 'They refused the Glory request.');
    return;
  end if;
  -- Serialize this giver's spending: concurrent accepts for the same giver
  -- wait here, then re-read a post-commit balance.
  perform 1 from public.profiles where id = g.giver_id for update;
  select coalesce(sum(amount), 0) into balance from public.xp_ledger where player_id = g.giver_id;
  if balance < g.amount then
    raise exception 'Not enough Glory (holds % GP).', balance;
  end if;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (g.giver_id, -g.amount, 'gift-sent', 'gift', g.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (g.requester_id, g.amount, 'gift-received', 'gift', g.id::text, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
  update public.gp_requests set status = 'ACCEPTED', responded_at = now() where id = p_request_id;
  insert into public.notifications (user_id, type, title, message)
    values (g.requester_id, 'COMPETITION_FINISHED',
      '+' || g.amount || ' Glory received', 'Your brother answered your call.');
end $$;
revoke all on function public.answer_gift(uuid, boolean) from public;
grant execute on function public.answer_gift(uuid, boolean) to authenticated;

-- ============ revoke direct member writes (RPCs only now) ============
drop policy if exists "members join competitions" on public.competition_participants;
drop policy if exists "members leave competitions" on public.competition_participants;
-- Staff ALL on participants stays (player replacements). Member waitlist
-- INSERT/DELETE stays (join_waitlist flow; ACTIVE+oath checked, position
-- server-assigned). gp_requests member UPDATE stays removed (0034).


-- ========== 0038_farm_caps.sql ==========
-- VIK Clan migration 0038: stop XP farming between friends.
-- (Body identical to app/supabase/migrations/0038_farm_caps.sql.)

alter table public.clan_settings
  add column if not exists xp_pair_cap_per_day int not null default 3,
  add column if not exists xp_friendly_cap_per_day int not null default 2;
do $$ begin
  alter table public.clan_settings add check (xp_pair_cap_per_day >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.clan_settings add check (xp_friendly_cap_per_day >= 0);
exception when duplicate_object then null; end $$;

alter table public.challenges
  add column if not exists xp_capped boolean not null default false;

-- ============ battle rewards with caps + transferred bounty ============
create or replace function public.grant_battle_rewards(p_challenge_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  s record;
  a_won boolean; is_draw boolean;
  opp uuid;
  winner uuid;
  v_day timestamptz := date_trunc('day', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
  pair_cap int := 3;
  friendly_cap int := 2;
  pair_today int := 0;
  f_today int := 0;
  pair_capped boolean := false;
  chal_capped boolean := false;
  opp_capped boolean := false;
  bal int := 0;
  amt int := 0;
begin
  select * into c from public.challenges where id = p_challenge_id;
  if c is null then raise exception 'Battle not found.'; end if;
  if c.status != 'COMPLETED' then raise exception 'Battle is not final.'; end if;
  if auth.uid() is distinct from c.challenger_id
    and (c.opponent_id is null or auth.uid() is distinct from c.opponent_id)
    and not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only participants can settle rewards.';
  end if;
  select * into s from public.clan_settings limit 1;
  if s is not null then
    pair_cap := coalesce(s.xp_pair_cap_per_day, 3);
    friendly_cap := coalesce(s.xp_friendly_cap_per_day, 2);
  end if;
  a_won := c.score_a > c.score_b;
  is_draw := c.score_a = c.score_b;
  opp := c.opponent_id;
  -- Per-pair daily cap: distinct battles (excluding this one) where BOTH
  -- duelists already earned battle XP today.
  if opp is not null then
    select count(*) into pair_today from (
      select l.ref_id from public.xp_ledger l
        where l.reason = 'battle' and l.ref_type = 'battle'
          and l.player_id in (c.challenger_id, opp)
          and l.created_at >= v_day
          and l.ref_id != c.id::text
      group by l.ref_id
      having count(distinct l.player_id) = 2
    ) s2;
    if pair_today >= pair_cap then
      pair_capped := true;
      chal_capped := true;
      opp_capped := true;
    end if;
  end if;
  -- Minted battle XP (winner 25 / draw 15 / loser 10), unless capped.
  if not pair_capped then
    if c.type = 'FRIENDLY' then
      select count(distinct l.ref_id) into f_today from public.xp_ledger l
        join public.challenges ch on ch.id::text = l.ref_id
        where l.reason = 'battle' and l.ref_type = 'battle'
          and l.player_id = c.challenger_id and ch.type = 'FRIENDLY'
          and l.created_at >= v_day and l.ref_id != c.id::text;
      if f_today >= friendly_cap then chal_capped := true; end if;
    end if;
    if not chal_capped then
      insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
        values (c.challenger_id, case when a_won then 25 when is_draw then 15 else 10 end,
          'battle', 'battle', c.id::text, public.vik_season())
        on conflict (player_id, ref_type, ref_id, reason) do nothing;
    end if;
    if opp is not null then
      if c.type = 'FRIENDLY' then
        select count(distinct l.ref_id) into f_today from public.xp_ledger l
          join public.challenges ch on ch.id::text = l.ref_id
          where l.reason = 'battle' and l.ref_type = 'battle'
            and l.player_id = opp and ch.type = 'FRIENDLY'
            and l.created_at >= v_day and l.ref_id != c.id::text;
        if f_today >= friendly_cap then opp_capped := true; end if;
      end if;
      if not opp_capped then
        insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
          values (opp, case when not a_won and not is_draw then 25 when is_draw then 15 else 10 end,
            'battle', 'battle', c.id::text, public.vik_season())
          on conflict (player_id, ref_type, ref_id, reason) do nothing;
      end if;
    end if;
  end if;
  if chal_capped or opp_capped then
    update public.challenges set xp_capped = true
      where id = c.id and xp_capped = false;
  end if;
  -- Forced bounty: TRANSFER from challenger to winner, capped at balance.
  if c.forced = true and not is_draw then
    winner := case when a_won then c.challenger_id else opp end;
    if winner is not null then
      select coalesce(sum(amount), 0) into bal from public.xp_ledger
        where player_id = c.challenger_id;
      amt := least(100, greatest(bal, 0));
      if amt > 0 then
        insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
          values (c.challenger_id, -amt, 'bounty-paid', 'battle', c.id::text, public.vik_season())
          on conflict (player_id, ref_type, ref_id, reason) do nothing;
        insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
          values (winner, amt, 'bounty', 'battle', c.id::text, public.vik_season())
          on conflict (player_id, ref_type, ref_id, reason) do nothing;
      end if;
    end if;
  end if;
end $$;
revoke all on function public.grant_battle_rewards(uuid) from public;
grant execute on function public.grant_battle_rewards(uuid) to authenticated;

-- ============ rival quest: a new opponent every week ============
create or replace function public.claim_quest(p_quest_key text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  daily text[] := array['first-blood','wanderer','caller','squire'];
  weekly text[] := array['veteran','rival'];
  kind text;
  xp int;
  v_day timestamptz := date_trunc('day', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
  v_week timestamptz := date_trunc('week', now() at time zone 'Africa/Casablanca') at time zone 'Africa/Casablanca';
  v_prev timestamptz := (date_trunc('week', now() at time zone 'Africa/Casablanca') - interval '7 days') at time zone 'Africa/Casablanca';
  since timestamptz;
  period text;
  done int := 0; target int := 1;
begin
  if p_quest_key = any(daily) then kind := 'daily';
  elsif p_quest_key = any(weekly) then kind := 'weekly';
  else raise exception 'Unknown quest.'; end if;
  if kind = 'daily' then
    since := v_day; period := (v_day at time zone 'Africa/Casablanca')::date::text;
  else
    since := v_week; period := (v_week at time zone 'Africa/Casablanca')::date::text;
  end if;
  case p_quest_key
    when 'first-blood' then xp := 30; target := 1;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since;
      done := least(done, 1);
    when 'wanderer' then xp := 60; target := 2;
      select count(*) into done from (
        select distinct case when player_a_id = me then player_b_id else player_a_id end
        from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since
      ) s;
      done := least(done, 2);
    when 'caller' then xp := 15; target := 1;
      select count(*) into done from public.challenges
        where challenger_id = me and created_at >= since;
      done := least(done, 1);
    when 'squire' then xp := 20; target := 1;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT')
          and confirmed_by = me and confirmed_at >= since;
      done := least(done, 1);
    when 'veteran' then xp := 80; target := 3;
      select count(*) into done from public.matches
        where (player_a_id = me or player_b_id = me)
          and status in ('CONFIRMED','FORFEIT') and confirmed_at >= since;
      done := least(done, 3);
    when 'rival' then xp := 50; target := 1;
      -- This week's member rematch vs an opponent NOT rematched last week.
      select count(*) into done from public.challenges cur
        where cur.type = 'REMATCH'
          and (cur.challenger_id = me or cur.opponent_id = me)
          and cur.opponent_id is not null
          and cur.created_at >= v_week
          and (case when cur.challenger_id = me then cur.opponent_id else cur.challenger_id end) not in (
            select case when challenger_id = me then opponent_id else challenger_id end
            from public.challenges
            where type = 'REMATCH'
              and (challenger_id = me or opponent_id = me)
              and opponent_id is not null
              and created_at >= v_prev and created_at < v_week
          );
      done := least(done, 1);
  end case;
  if done < target then raise exception 'Quest not complete yet.'; end if;
  begin
    insert into public.quest_claims (player_id, quest_key, period)
      values (me, p_quest_key, period);
  exception when unique_violation then
    raise exception 'Already claimed.';
  end;
  insert into public.xp_ledger (player_id, amount, reason, ref_type, ref_id, season)
    values (me, xp, 'quest:' || p_quest_key, 'quest', p_quest_key || ':' || period, public.vik_season())
    on conflict (player_id, ref_type, ref_id, reason) do nothing;
end $$;
revoke all on function public.claim_quest(text) from public;
grant execute on function public.claim_quest(text) to authenticated;






-- ========== 0039_account_gaps.sql ==========
-- VIK Clan migration 0039: account-level gaps.
-- (Body identical to app/supabase/migrations/0039_account_gaps.sql.)
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
-- VIK Clan migration 0040: 4vs4 League schema foundation.
-- Run AFTER 0039. Additive only: no existing table is altered or removed.
--
-- Scope (Phase 1):
--   * league_* tables, constraints, indexes, and server-side guard triggers;
--   * RLS enabled on every table; SELECT-only client policies;
--   * helpers used by RLS to hide lineups until reveal;
--   * realtime publication entries;
--   * authoritative writes remain RPC-only (functions arrive in 0041).
--
-- Not in this migration:
--   * league RPCs / scoring / standings / cron (0041, 0042);
--   * new storage buckets. Result evidence reuses the existing private
--     match-evidence bucket and will be path-validated in 0041.
--
-- Reuses: public.profiles, public.is_clan_role(text[]), auth.uid().
-- Convention: UTC timestamptz; server timestamps; partial unique indexes.

-- ============================================================================
-- 1. Tables
-- ============================================================================

create table if not exists public.league_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','REGISTRATION','ACTIVE','COMPLETED','ARCHIVED')),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_at timestamptz,
  matchday_days int not null default 7 check (matchday_days between 1 and 14),
  min_teams int not null default 4 check (min_teams between 2 and 16),
  max_teams int not null default 8 check (max_teams between 2 and 16),
  roster_min int not null default 6 check (roster_min between 6 and 8),
  roster_max int not null default 8 check (roster_max between 6 and 8),
  points_win int not null default 3 check (points_win between 0 and 10),
  points_draw int not null default 1 check (points_draw between 0 and 10),
  points_loss int not null default 0 check (points_loss between 0 and 10),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_seasons_name_check check (char_length(btrim(name)) between 2 and 80),
  constraint league_seasons_teams_check check (max_teams >= min_teams),
  constraint league_seasons_roster_check check (roster_max >= roster_min),
  constraint league_seasons_window_check check (
    registration_opens_at is null
    or registration_closes_at is null
    or registration_closes_at > registration_opens_at
  ),
  constraint league_seasons_start_check check (
    starts_at is null
    or registration_closes_at is null
    or starts_at >= registration_closes_at
  )
);

create table if not exists public.league_teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  name text not null,
  logo_path text,
  captain_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED','WITHDRAWN','DISQUALIFIED')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_teams_name_check check (char_length(btrim(name)) between 2 and 40),
  unique (id, season_id)
);

create table if not exists public.league_team_members (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  team_id uuid not null,
  player_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'PLAYER' check (role in ('CAPTAIN','PLAYER')),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','LEFT','REMOVED','REPLACED')),
  joined_at timestamptz not null default now(),
  joined_matchday int check (joined_matchday is null or joined_matchday > 0),
  left_at timestamptz,
  replaced_by uuid references public.profiles(id) on delete set null,
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_members_left_check check (left_at is null or left_at >= joined_at),
  constraint league_members_replace_check check (replaced_by is null or replaced_by <> player_id),
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_team_invites (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  team_id uuid not null,
  player_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'PENDING'
    check (status in ('PENDING','ACCEPTED','DECLINED','REVOKED','EXPIRED')),
  message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz,
  constraint league_invites_self_check check (player_id <> invited_by),
  constraint league_invites_message_check check (message is null or char_length(message) <= 500),
  constraint league_invites_expiry_check check (expires_at is null or expires_at > created_at),
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_matchdays (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  number int not null check (number > 0),
  opens_at timestamptz not null,
  deadline timestamptz not null,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED','OPEN','CLOSED','COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_matchdays_window_check check (deadline > opens_at),
  unique (season_id, number),
  unique (id, season_id)
);

create table if not exists public.league_byes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  matchday_id uuid not null,
  team_id uuid not null,
  created_at timestamptz not null default now(),
  unique (matchday_id, team_id),
  foreign key (matchday_id, season_id)
    references public.league_matchdays(id, season_id) on delete cascade,
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.league_seasons(id) on delete cascade,
  matchday_id uuid not null,
  leg int not null check (leg in (1, 2)),
  home_team_id uuid not null,
  away_team_id uuid not null,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED','LINEUPS_PENDING','LINEUPS_REVEALED','IN_PROGRESS','COMPLETED','FORFEITED','CANCELLED')),
  home_duel_wins int not null default 0 check (home_duel_wins between 0 and 4),
  away_duel_wins int not null default 0 check (away_duel_wins between 0 and 4),
  home_points int not null default 0 check (home_points in (0,1,3)),
  away_points int not null default 0 check (away_points in (0,1,3)),
  revealed_at timestamptz,
  completed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_fixtures_teams_check check (home_team_id <> away_team_id),
  constraint league_fixtures_duel_total_check check (home_duel_wins + away_duel_wins <= 4),
  constraint league_fixtures_final_total_check check (
    status not in ('COMPLETED','FORFEITED')
    or home_duel_wins + away_duel_wins = 4
  ),
  constraint league_fixtures_final_points_check check (
    status not in ('COMPLETED','FORFEITED')
    or (home_points = 3 and away_points = 0)
    or (home_points = 1 and away_points = 1)
    or (home_points = 0 and away_points = 3)
  ),
  unique (season_id, leg, home_team_id, away_team_id),
  foreign key (matchday_id, season_id)
    references public.league_matchdays(id, season_id) on delete cascade,
  foreign key (home_team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade,
  foreign key (away_team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_lineups (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.league_fixtures(id) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete cascade,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  version int not null default 1 check (version > 0),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','SUBMITTED','REVEALED','LOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, team_id)
);

create table if not exists public.league_lineup_players (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.league_lineups(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('STARTER','SUB')),
  slot int not null check (slot between 1 and 4),
  created_at timestamptz not null default now(),
  unique (lineup_id, player_id),
  unique (lineup_id, role, slot)
);

create table if not exists public.league_duels (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.league_fixtures(id) on delete cascade,
  matchday_id uuid not null references public.league_matchdays(id) on delete cascade,
  slot int not null check (slot between 1 and 4),
  home_team_id uuid not null references public.league_teams(id) on delete cascade,
  away_team_id uuid not null references public.league_teams(id) on delete cascade,
  home_player_id uuid not null references public.profiles(id) on delete restrict,
  away_player_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED','STARTED','AWAITING_RESULTS','DISPUTED','CONFIRMED','FORFEITED','CANCELLED')),
  started_at timestamptz,
  deadline timestamptz not null,
  home_score int check (home_score is null or home_score between 0 and 99),
  away_score int check (away_score is null or away_score between 0 and 99),
  winner_team_id uuid references public.league_teams(id) on delete restrict,
  confirmed_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_duels_teams_check check (home_team_id <> away_team_id),
  constraint league_duels_winner_check check (
    winner_team_id is null or winner_team_id in (home_team_id, away_team_id)
  ),
  constraint league_duels_confirmed_check check (
    status <> 'CONFIRMED'
    or (home_score is not null and away_score is not null
        and home_score <> away_score and winner_team_id is not null)
  ),
  constraint league_duels_forfeit_winner_check check (
    status <> 'FORFEITED' or winner_team_id is not null
  ),
  unique (fixture_id, slot),
  unique (fixture_id, home_player_id),
  unique (fixture_id, away_player_id)
);

create table if not exists public.league_substitutions (
  id uuid primary key default gen_random_uuid(),
  duel_id uuid not null references public.league_duels(id) on delete cascade,
  fixture_id uuid not null references public.league_fixtures(id) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete cascade,
  out_player_id uuid not null references public.profiles(id) on delete restrict,
  in_player_id uuid not null references public.profiles(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint league_substitutions_player_check check (out_player_id <> in_player_id),
  unique (duel_id, team_id),
  unique (fixture_id, team_id, in_player_id)
);

create table if not exists public.league_duel_reports (
  id uuid primary key default gen_random_uuid(),
  duel_id uuid not null references public.league_duels(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete restrict,
  team_id uuid not null references public.league_teams(id) on delete restrict,
  side text not null check (side in ('HOME','AWAY')),
  score_for int not null check (score_for between 0 and 99),
  score_against int not null check (score_against between 0 and 99),
  decided_by text not null default 'REGULATION'
    check (decided_by in ('REGULATION','EXTRA_TIME','PENALTIES')),
  evidence_path text not null check (length(btrim(evidence_path)) > 0),
  note text,
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED','CONFIRMED','DISPUTED','REJECTED')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_reports_decisive_check check (score_for <> score_against),
  constraint league_reports_note_check check (note is null or char_length(note) <= 1000),
  unique (duel_id, player_id)
);

create table if not exists public.league_disputes (
  id uuid primary key default gen_random_uuid(),
  duel_id uuid not null references public.league_duels(id) on delete cascade,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null,
  evidence_path text,
  status text not null default 'OPEN'
    check (status in ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED')),
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_disputes_reason_check check (char_length(btrim(reason)) between 3 and 1000)
);

create table if not exists public.league_penalties (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  team_id uuid not null,
  matchday_id uuid references public.league_matchdays(id) on delete set null,
  points int not null check (points between -100 and 100 and points <> 0),
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint league_penalties_reason_check check (char_length(btrim(reason)) between 3 and 1000),
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_tiebreak_orders (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  team_id uuid not null,
  position int not null check (position > 0),
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint league_tiebreak_reason_check check (char_length(btrim(reason)) between 3 and 1000),
  unique (season_id, team_id),
  unique (season_id, position),
  foreign key (team_id, season_id)
    references public.league_teams(id, season_id) on delete cascade
);

create table if not exists public.league_audit_logs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.league_seasons(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. Indexes and partial uniqueness
-- ============================================================================

create unique index if not exists league_seasons_one_active_idx
  on public.league_seasons (status) where status = 'ACTIVE';

create unique index if not exists league_teams_name_ci_idx
  on public.league_teams (season_id, lower(name));

create unique index if not exists league_teams_one_captain_idx
  on public.league_teams (season_id, captain_id)
  where status in ('PENDING','APPROVED');

create unique index if not exists league_members_one_active_idx
  on public.league_team_members (season_id, player_id)
  where status = 'ACTIVE';

create unique index if not exists league_members_one_captain_idx
  on public.league_team_members (team_id)
  where role = 'CAPTAIN' and status = 'ACTIVE';

create unique index if not exists league_invites_one_pending_idx
  on public.league_team_invites (team_id, player_id)
  where status = 'PENDING';

create index if not exists league_members_player_idx
  on public.league_team_members (player_id, status);

create index if not exists league_invites_player_idx
  on public.league_team_invites (player_id, status);

create index if not exists league_fixtures_season_idx
  on public.league_fixtures (season_id, matchday_id);

create index if not exists league_fixtures_teams_idx
  on public.league_fixtures (home_team_id, away_team_id);

create index if not exists league_lineups_fixture_idx
  on public.league_lineups (fixture_id);

create index if not exists league_duels_fixture_idx
  on public.league_duels (fixture_id, slot);

create index if not exists league_duels_players_idx
  on public.league_duels (home_player_id, away_player_id);

create index if not exists league_reports_duel_idx
  on public.league_duel_reports (duel_id, status);

create unique index if not exists league_disputes_one_open_idx
  on public.league_disputes (duel_id)
  where status in ('OPEN','UNDER_REVIEW');

create index if not exists league_disputes_status_idx
  on public.league_disputes (status, created_at);

create index if not exists league_penalties_team_idx
  on public.league_penalties (season_id, team_id);

create index if not exists league_audit_season_idx
  on public.league_audit_logs (season_id, created_at desc);

-- ============================================================================
-- 3. RLS helpers (definer: must read across tables without recursive RLS)
-- ============================================================================

create or replace function public.league_is_team_member(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.league_team_members m
    join public.profiles p
      on p.id = m.player_id
     and p.status = 'ACTIVE'
    where m.team_id = p_team_id
      and m.player_id = p_user_id
      and m.status = 'ACTIVE'
  );
$$;

create or replace function public.league_is_team_captain(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.league_teams t
    join public.league_team_members m
      on m.team_id = t.id
     and m.player_id = p_user_id
     and m.role = 'CAPTAIN'
     and m.status = 'ACTIVE'
    join public.profiles p
      on p.id = m.player_id
     and p.status = 'ACTIVE'
    where t.id = p_team_id
      and t.captain_id = p_user_id
  );
$$;

-- True for staff, the lineups own team, and the opponent only after reveal.
create or replace function public.league_can_view_lineup(p_fixture_id uuid, p_team_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_home uuid;
  v_away uuid;
  v_status text;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;
  if public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    return true;
  end if;

  select f.home_team_id, f.away_team_id, f.status
    into v_home, v_away, v_status
  from public.league_fixtures f
  where f.id = p_fixture_id;

  if v_home is null or p_team_id not in (v_home, v_away) then
    return false;
  end if;

  if public.league_is_team_member(p_team_id, v_uid) then
    return true;
  end if;

  if v_status in ('LINEUPS_REVEALED','IN_PROGRESS','COMPLETED','FORFEITED') then
    return public.league_is_team_member(
      case when p_team_id = v_home then v_away else v_home end,
      v_uid
    );
  end if;

  return false;
end;
$$;

create or replace function public.league_can_view_lineup_player(p_lineup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select public.league_can_view_lineup(l.fixture_id, l.team_id)
    from public.league_lineups l
    where l.id = p_lineup_id
  ), false);
$$;

-- Reports/disputes are visible to both squads (captains need them) and staff.
create or replace function public.league_can_view_duel_report(p_duel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE'
    )
    and (
      public.is_clan_role(array['OWNER','ADMIN','MODERATOR'])
      or exists (
        select 1
        from public.league_duels d
        join public.league_team_members m
          on (m.team_id = d.home_team_id or m.team_id = d.away_team_id)
         and m.player_id = auth.uid()
         and m.status = 'ACTIVE'
        where d.id = p_duel_id
      )
      or exists (
        select 1 from public.league_duels d
        where d.id = p_duel_id
          and (d.home_player_id = auth.uid() or d.away_player_id = auth.uid())
      )
      or exists (
        select 1 from public.league_duel_reports r
        where r.duel_id = p_duel_id and r.player_id = auth.uid()
      )
      or exists (
        select 1 from public.league_disputes x
        where x.duel_id = p_duel_id and x.opened_by = auth.uid()
      )
    );
$$;

-- ============================================================================
-- 4. Guard triggers
-- ============================================================================

create or replace function public.league_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.league_guard_team()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_min int;
  v_max int;
  v_count int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.captain_id and p.status = 'ACTIVE'
  ) then
    raise exception 'League captain must be an ACTIVE clan member.';
  end if;

  if new.status = 'APPROVED' then
    select s.roster_min, s.roster_max
      into v_min, v_max
    from public.league_seasons s
    where s.id = new.season_id;

    select count(*) into v_count
    from public.league_team_members m
    where m.team_id = new.id and m.status = 'ACTIVE';

    if v_min is null or v_count < v_min or v_count > v_max then
      raise exception 'Approved league squad needs %-% active players (has %).',
        coalesce(v_min, 6), coalesce(v_max, 8), v_count;
    end if;

    if not exists (
      select 1 from public.league_team_members m
      where m.team_id = new.id
        and m.player_id = new.captain_id
        and m.role = 'CAPTAIN'
        and m.status = 'ACTIVE'
    ) then
      raise exception 'League captain must be an active squad member.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_max int;
  v_count int;
  v_check_roster boolean := false;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.player_id and p.status = 'ACTIVE'
  ) then
    raise exception 'League squad members must be ACTIVE clan members.';
  end if;

  if new.status = 'ACTIVE' then
    if tg_op = 'INSERT' then
      v_check_roster := true;
    elsif old.status is distinct from 'ACTIVE'
       or old.team_id is distinct from new.team_id then
      v_check_roster := true;
    end if;
  end if;

  if v_check_roster then
    select s.roster_max into v_max
    from public.league_teams t
    join public.league_seasons s on s.id = t.season_id
    where t.id = new.team_id;

    if v_max is null then
      raise exception 'League squad or season not found.';
    end if;

    select count(*) into v_count
    from public.league_team_members m
    where m.team_id = new.team_id
      and m.status = 'ACTIVE'
      and m.id <> new.id;

    if v_count >= v_max then
      raise exception 'League squad is full (max % active players).', v_max;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_invite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_captain uuid;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.player_id and p.status = 'ACTIVE'
  ) then
    raise exception 'Only ACTIVE clan members can receive league invites.';
  end if;

  select t.captain_id into v_captain
  from public.league_teams t
  where t.id = new.team_id;

  if v_captain is null then
    raise exception 'League squad not found.';
  end if;

  if new.player_id = v_captain then
    raise exception 'The captain is already part of the squad.';
  end if;

  if new.status = 'PENDING' and exists (
    select 1 from public.league_team_members m
    where m.season_id = new.season_id
      and m.player_id = new.player_id
      and m.status = 'ACTIVE'
  ) then
    raise exception 'Player already has an active league squad this season.';
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_fixture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expected_home int;
  v_expected_away int;
begin
  if new.status in ('COMPLETED','FORFEITED') then
    if new.home_duel_wins + new.away_duel_wins <> 4 then
      raise exception 'A final league fixture must have exactly four decided duels.';
    end if;

    v_expected_home := case
      when new.home_duel_wins > new.away_duel_wins then 3
      when new.home_duel_wins = new.away_duel_wins then 1
      else 0
    end;
    v_expected_away := case
      when new.away_duel_wins > new.home_duel_wins then 3
      when new.away_duel_wins = new.home_duel_wins then 1
      else 0
    end;

    if new.home_points <> v_expected_home or new.away_points <> v_expected_away then
      raise exception 'League fixture points do not match the 3/1/0 duel result.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_lineup()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_home uuid;
  v_away uuid;
  v_starters int;
  v_subs int;
begin
  select f.home_team_id, f.away_team_id
    into v_home, v_away
  from public.league_fixtures f
  where f.id = new.fixture_id;

  if v_home is null then
    raise exception 'League fixture not found.';
  end if;

  if new.team_id not in (v_home, v_away) then
    raise exception 'Lineup team is not part of this fixture.';
  end if;

  if new.status <> 'DRAFT' then
    select
      count(*) filter (where lp.role = 'STARTER'),
      count(*) filter (where lp.role = 'SUB')
      into v_starters, v_subs
    from public.league_lineup_players lp
    where lp.lineup_id = new.id;

    if v_starters <> 4 then
      raise exception 'A league lineup needs exactly 4 starters (has %).', v_starters;
    end if;
    if v_subs < 2 or v_subs > 4 then
      raise exception 'A league lineup needs 2-4 substitutes (has %).', v_subs;
    end if;

    if exists (
      select 1
      from public.league_lineup_players lp
      where lp.lineup_id = new.id
        and not exists (
          select 1 from public.league_team_members m
          where m.team_id = new.team_id
            and m.player_id = lp.player_id
            and m.status = 'ACTIVE'
        )
    ) then
      raise exception 'Every lineup player must be an ACTIVE squad member.';
    end if;

    if new.submitted_at is null then
      new.submitted_at := now();
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_lineup_player()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
  v_status text;
begin
  select l.team_id, l.status
    into v_team, v_status
  from public.league_lineups l
  where l.id = new.lineup_id;

  if v_team is null then
    raise exception 'League lineup not found.';
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'Lineup players can only be changed while the lineup is DRAFT.';
  end if;

  if not public.league_is_team_member(v_team, new.player_id) then
    raise exception 'Lineup player is not an ACTIVE member of this squad.';
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_duel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_home uuid;
  v_away uuid;
  v_matchday uuid;
begin
  select f.home_team_id, f.away_team_id, f.matchday_id
    into v_home, v_away, v_matchday
  from public.league_fixtures f
  where f.id = new.fixture_id;

  if v_home is null then
    raise exception 'League fixture not found.';
  end if;

  if new.home_team_id <> v_home or new.away_team_id <> v_away then
    raise exception 'Duel teams do not match the fixture.';
  end if;

  if new.matchday_id <> v_matchday then
    raise exception 'Duel matchday does not match the fixture.';
  end if;

  if tg_op = 'INSERT' then
    if not public.league_is_team_member(v_home, new.home_player_id) then
      raise exception 'Home duel player is not an ACTIVE home squad member.';
    end if;
    if not public.league_is_team_member(v_away, new.away_player_id) then
      raise exception 'Away duel player is not an ACTIVE away squad member.';
    end if;
  else
    if new.home_player_id is distinct from old.home_player_id
       and not public.league_is_team_member(v_home, new.home_player_id) then
      raise exception 'Home duel player is not an ACTIVE home squad member.';
    end if;
    if new.away_player_id is distinct from old.away_player_id
       and not public.league_is_team_member(v_away, new.away_player_id) then
      raise exception 'Away duel player is not an ACTIVE away squad member.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_substitution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.league_duels%rowtype;
begin
  select * into v_duel
  from public.league_duels d
  where d.id = new.duel_id;

  if v_duel.id is null then
    raise exception 'League duel not found.';
  end if;

  if new.fixture_id <> v_duel.fixture_id then
    raise exception 'Substitution fixture does not match the duel.';
  end if;

  if new.team_id not in (v_duel.home_team_id, v_duel.away_team_id) then
    raise exception 'Substitution team is not part of this duel.';
  end if;

  if v_duel.started_at is not null then
    raise exception 'Substitutions are locked after the duel starts.';
  end if;

  if exists (
    select 1 from public.league_duel_reports r
    where r.duel_id = new.duel_id
  ) then
    raise exception 'Substitutions are locked after a result is reported.';
  end if;

  if new.team_id = v_duel.home_team_id
     and new.out_player_id <> v_duel.home_player_id then
    raise exception 'Substituted-out player is not the current home duel player.';
  end if;
  if new.team_id = v_duel.away_team_id
     and new.out_player_id <> v_duel.away_player_id then
    raise exception 'Substituted-out player is not the current away duel player.';
  end if;

  if not public.league_is_team_member(new.team_id, new.in_player_id) then
    raise exception 'Substitute is not an ACTIVE squad member.';
  end if;

  if not exists (
    select 1
    from public.league_lineup_players lp
    join public.league_lineups l on l.id = lp.lineup_id
    where l.fixture_id = v_duel.fixture_id
      and l.team_id = new.team_id
      and lp.player_id = new.in_player_id
      and lp.role = 'SUB'
  ) then
    raise exception 'Substitute is not on this fixture bench.';
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_duel_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.league_duels%rowtype;
begin
  select * into v_duel
  from public.league_duels d
  where d.id = new.duel_id;

  if v_duel.id is null then
    raise exception 'League duel not found.';
  end if;

  if new.team_id = v_duel.home_team_id then
    if new.side <> 'HOME' or new.player_id <> v_duel.home_player_id then
      raise exception 'Home report must come from the current home duel player.';
    end if;
  elsif new.team_id = v_duel.away_team_id then
    if new.side <> 'AWAY' or new.player_id <> v_duel.away_player_id then
      raise exception 'Away report must come from the current away duel player.';
    end if;
  else
    raise exception 'Report team is not part of this duel.';
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('CONFIRMED','REJECTED') then
      raise exception 'Confirmed or rejected league reports are immutable.';
    end if;
  end if;

  if new.evidence_path not like 'league/%' then
    raise exception 'League evidence must use the league/ storage prefix.';
  end if;

  return new;
end;
$$;

create or replace function public.league_guard_dispute()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    if not exists (
      select 1
      from public.league_duels d
      join public.league_team_members m
        on (m.team_id = d.home_team_id or m.team_id = d.away_team_id)
       and m.player_id = new.opened_by
       and m.status = 'ACTIVE'
      where d.id = new.duel_id
    ) then
      raise exception 'Only a duel participant, participant squad member, or staff can open a dispute.';
    end if;
  end if;

  if new.evidence_path is not null and new.evidence_path not like 'league/%' then
    raise exception 'League evidence must use the league/ storage prefix.';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 5. Trigger installation
-- ============================================================================

drop trigger if exists league_seasons_touch on public.league_seasons;
create trigger league_seasons_touch before update on public.league_seasons
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_teams_touch on public.league_teams;
create trigger league_teams_touch before update on public.league_teams
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_members_touch on public.league_team_members;
create trigger league_members_touch before update on public.league_team_members
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_matchdays_touch on public.league_matchdays;
create trigger league_matchdays_touch before update on public.league_matchdays
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_fixtures_touch on public.league_fixtures;
create trigger league_fixtures_touch before update on public.league_fixtures
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_lineups_touch on public.league_lineups;
create trigger league_lineups_touch before update on public.league_lineups
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_duels_touch on public.league_duels;
create trigger league_duels_touch before update on public.league_duels
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_reports_touch on public.league_duel_reports;
create trigger league_reports_touch before update on public.league_duel_reports
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_disputes_touch on public.league_disputes;
create trigger league_disputes_touch before update on public.league_disputes
  for each row execute function public.league_touch_updated_at();

drop trigger if exists league_teams_guard on public.league_teams;
create trigger league_teams_guard before insert or update on public.league_teams
  for each row execute function public.league_guard_team();

drop trigger if exists league_members_guard on public.league_team_members;
create trigger league_members_guard before insert or update on public.league_team_members
  for each row execute function public.league_guard_member();

drop trigger if exists league_invites_guard on public.league_team_invites;
create trigger league_invites_guard before insert or update on public.league_team_invites
  for each row execute function public.league_guard_invite();

drop trigger if exists league_fixtures_guard on public.league_fixtures;
create trigger league_fixtures_guard before insert or update on public.league_fixtures
  for each row execute function public.league_guard_fixture();

drop trigger if exists league_lineups_guard on public.league_lineups;
create trigger league_lineups_guard before insert or update on public.league_lineups
  for each row execute function public.league_guard_lineup();

drop trigger if exists league_lineup_players_guard on public.league_lineup_players;
create trigger league_lineup_players_guard before insert or update on public.league_lineup_players
  for each row execute function public.league_guard_lineup_player();

drop trigger if exists league_duels_guard on public.league_duels;
create trigger league_duels_guard before insert or update on public.league_duels
  for each row execute function public.league_guard_duel();

drop trigger if exists league_substitutions_guard on public.league_substitutions;
create trigger league_substitutions_guard before insert on public.league_substitutions
  for each row execute function public.league_guard_substitution();

drop trigger if exists league_reports_guard on public.league_duel_reports;
create trigger league_reports_guard before insert or update on public.league_duel_reports
  for each row execute function public.league_guard_duel_report();

drop trigger if exists league_disputes_guard on public.league_disputes;
create trigger league_disputes_guard before insert or update on public.league_disputes
  for each row execute function public.league_guard_dispute();

-- ============================================================================
-- 6. RLS: read policies only. All writes go through definer RPCs in 0041.
-- ============================================================================

alter table public.league_seasons enable row level security;
alter table public.league_teams enable row level security;
alter table public.league_team_members enable row level security;
alter table public.league_team_invites enable row level security;
alter table public.league_matchdays enable row level security;
alter table public.league_byes enable row level security;
alter table public.league_fixtures enable row level security;
alter table public.league_lineups enable row level security;
alter table public.league_lineup_players enable row level security;
alter table public.league_duels enable row level security;
alter table public.league_substitutions enable row level security;
alter table public.league_duel_reports enable row level security;
alter table public.league_disputes enable row level security;
alter table public.league_penalties enable row level security;
alter table public.league_tiebreak_orders enable row level security;
alter table public.league_audit_logs enable row level security;

drop policy if exists "league read seasons" on public.league_seasons;
create policy "league read seasons" on public.league_seasons
  for select to authenticated using (true);

drop policy if exists "league read teams" on public.league_teams;
create policy "league read teams" on public.league_teams
  for select to authenticated using (true);

drop policy if exists "league read members" on public.league_team_members;
create policy "league read members" on public.league_team_members
  for select to authenticated using (true);

drop policy if exists "league read own invites" on public.league_team_invites;
create policy "league read own invites" on public.league_team_invites
  for select to authenticated using (
    player_id = auth.uid()
    or public.league_is_team_captain(team_id, auth.uid())
    or public.is_clan_role(array['OWNER','ADMIN','MODERATOR'])
  );

drop policy if exists "league read matchdays" on public.league_matchdays;
create policy "league read matchdays" on public.league_matchdays
  for select to authenticated using (true);

drop policy if exists "league read byes" on public.league_byes;
create policy "league read byes" on public.league_byes
  for select to authenticated using (true);

drop policy if exists "league read fixtures" on public.league_fixtures;
create policy "league read fixtures" on public.league_fixtures
  for select to authenticated using (true);

drop policy if exists "league read visible lineups" on public.league_lineups;
create policy "league read visible lineups" on public.league_lineups
  for select to authenticated using (
    public.league_can_view_lineup(fixture_id, team_id)
  );

drop policy if exists "league read visible lineup players" on public.league_lineup_players;
create policy "league read visible lineup players" on public.league_lineup_players
  for select to authenticated using (
    public.league_can_view_lineup_player(lineup_id)
  );

drop policy if exists "league read duels" on public.league_duels;
create policy "league read duels" on public.league_duels
  for select to authenticated using (true);

drop policy if exists "league read substitutions" on public.league_substitutions;
create policy "league read substitutions" on public.league_substitutions
  for select to authenticated using (true);

drop policy if exists "league read duel reports" on public.league_duel_reports;
create policy "league read duel reports" on public.league_duel_reports
  for select to authenticated using (
    public.league_can_view_duel_report(duel_id)
  );

drop policy if exists "league read disputes" on public.league_disputes;
create policy "league read disputes" on public.league_disputes
  for select to authenticated using (
    public.league_can_view_duel_report(duel_id)
  );

drop policy if exists "league read penalties" on public.league_penalties;
create policy "league read penalties" on public.league_penalties
  for select to authenticated using (true);

drop policy if exists "league read tiebreaks" on public.league_tiebreak_orders;
create policy "league read tiebreaks" on public.league_tiebreak_orders
  for select to authenticated using (true);

drop policy if exists "league read audit" on public.league_audit_logs;
create policy "league read audit" on public.league_audit_logs
  for select to authenticated using (
    public.is_clan_role(array['OWNER','ADMIN','MODERATOR'])
  );

-- ============================================================================
-- 7. Function grants
-- ============================================================================

revoke all on function public.league_is_team_member(uuid, uuid) from public, anon;
revoke all on function public.league_is_team_captain(uuid, uuid) from public, anon;
revoke all on function public.league_can_view_lineup(uuid, uuid) from public, anon;
revoke all on function public.league_can_view_lineup_player(uuid) from public, anon;
revoke all on function public.league_can_view_duel_report(uuid) from public, anon;

grant execute on function public.league_is_team_member(uuid, uuid) to authenticated;
grant execute on function public.league_is_team_captain(uuid, uuid) to authenticated;
grant execute on function public.league_can_view_lineup(uuid, uuid) to authenticated;
grant execute on function public.league_can_view_lineup_player(uuid) to authenticated;
grant execute on function public.league_can_view_duel_report(uuid) to authenticated;

-- ============================================================================
-- 8. Realtime publication (RLS still filters every subscriber)
-- ============================================================================

do $$ begin alter publication supabase_realtime add table public.league_seasons; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_teams; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_team_members; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_matchdays; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_fixtures; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_lineups; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_duels; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_duel_reports; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_disputes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.league_penalties; exception when duplicate_object then null; end $$;

-- ============================================================================
-- 9. Documentation notes
-- ============================================================================
-- * RLS hides lineups until league_can_view_lineup returns true. Never fetch
--   opponent lineups directly and never hide them with CSS only.
-- * Direct writes to all league_* tables are intentionally denied. 0041 adds
--   SECURITY DEFINER RPCs for every mutation.
-- * league_duel_reports.evidence_path must start with league/ and points into
--   the existing private match-evidence bucket. 0041 validates the file exists.
-- * league_fixtures points are checked against the duel-wins result here and
--   are recomputed server-side in 0041/0042.
-- VIK Clan migration 0041: 4vs4 League authoritative RPCs.
-- Run AFTER 0040. Additive only: no existing table is altered or removed.
--
-- Scope (Phase 2):
--   * season, squad, invite, roster, lineup, duel, result, dispute and
--     penalty mutations are SECURITY DEFINER RPCs only;
--   * every function authenticates auth.uid(), validates ownership and uses
--     row locks in a stable order (season -> team/matchday/fixture -> duel);
--   * fixture reveal/finalization and rankings are server-computed;
--   * evidence paths are checked against the private match-evidence bucket;
--   * client-supplied scores, points, winners and timestamps are never trusted.
--
-- Not in this migration:
--   * deadline cron (0042);
--   * frontend services/pages;
--   * optional league logos.

-- ============================================================================
-- 1. Authorization and audit helpers (internal; execute revoked below)
-- ============================================================================

create or replace function public.league_require_active()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.status = 'ACTIVE'
  ) then
    raise exception 'An ACTIVE clan member is required.';
  end if;
  return v_uid;
end;
$$;

create or replace function public.league_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.league_require_active();
begin
  if not public.is_clan_role(array['OWNER','ADMIN']) then
    raise exception 'Only OWNER or ADMIN can manage the league.';
  end if;
  return v_uid;
end;
$$;

create or replace function public.league_require_dispute_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.league_require_active();
begin
  if not public.is_clan_role(array['OWNER','ADMIN','MODERATOR']) then
    raise exception 'Only league staff can resolve disputes.';
  end if;
  return v_uid;
end;
$$;

create or replace function public.league_require_captain(p_team_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := public.league_require_active();
  v_captain uuid;
begin
  select t.captain_id into v_captain
  from public.league_teams t
  where t.id = p_team_id;

  if v_captain is null then
    raise exception 'League squad not found.';
  end if;
  if v_captain <> v_uid then
    raise exception 'Only the league squad captain can do this.';
  end if;
  return v_uid;
end;
$$;

create or replace function public.league_audit(
  p_season_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old_data jsonb,
  p_new_data jsonb,
  p_reason text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.league_audit_logs
    (season_id, actor_id, action, entity_type, entity_id, old_data, new_data, reason)
  values
    (p_season_id, auth.uid(), p_action, p_entity_type, p_entity_id,
     p_old_data, p_new_data, p_reason);
$$;

create or replace function public.league_notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications
    (user_id, type, title, message, entity_type, entity_id)
  select p_user_id, p_type, p_title, p_message, p_entity_type, p_entity_id
  where p_user_id is not null;
$$;

create or replace function public.league_notify_team(
  p_team_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select distinct m.player_id
    from public.league_team_members m
    join public.profiles p on p.id = m.player_id and p.status = 'ACTIVE'
    where m.team_id = p_team_id and m.status = 'ACTIVE'
  loop
    perform public.league_notify(
      r.player_id, p_type, p_title, p_message, p_entity_type, p_entity_id);
  end loop;
end;
$$;

create or replace function public.league_notify_staff(
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select p.id
    from public.profiles p
    where p.status = 'ACTIVE'
      and p.role in ('OWNER','ADMIN','MODERATOR')
  loop
    perform public.league_notify(
      r.id, p_type, p_title, p_message, p_entity_type, p_entity_id);
  end loop;
end;
$$;

create or replace function public.league_notify_season(
  p_season_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in
    select distinct m.player_id
    from public.league_team_members m
    join public.league_teams t on t.id = m.team_id and t.status = 'APPROVED'
    join public.profiles p on p.id = m.player_id and p.status = 'ACTIVE'
    where m.season_id = p_season_id and m.status = 'ACTIVE'
  loop
    perform public.league_notify(
      r.player_id, p_type, p_title, p_message, p_entity_type, p_entity_id);
  end loop;
end;
$$;

-- ============================================================================
-- 2. Row-lock helpers (stable order: season -> child row)
-- ============================================================================

create or replace function public.league_lock_season(p_season_id uuid)
returns public.league_seasons
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
begin
  select * into v_season
  from public.league_seasons s
  where s.id = p_season_id
  for update;

  if v_season.id is null then
    raise exception 'League season not found.';
  end if;
  return v_season;
end;
$$;

create or replace function public.league_lock_team(p_team_id uuid)
returns public.league_teams
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
begin
  select * into v_team
  from public.league_teams t
  where t.id = p_team_id;

  if v_team.id is null then
    raise exception 'League squad not found.';
  end if;

  perform public.league_lock_season(v_team.season_id);

  select * into v_team
  from public.league_teams t
  where t.id = p_team_id
  for update;

  return v_team;
end;
$$;

create or replace function public.league_lock_matchday(p_matchday_id uuid)
returns public.league_matchdays
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_matchday public.league_matchdays%rowtype;
begin
  select * into v_matchday
  from public.league_matchdays m
  where m.id = p_matchday_id;

  if v_matchday.id is null then
    raise exception 'League matchday not found.';
  end if;

  perform public.league_lock_season(v_matchday.season_id);

  select * into v_matchday
  from public.league_matchdays m
  where m.id = p_matchday_id
  for update;

  return v_matchday;
end;
$$;

create or replace function public.league_lock_fixture(p_fixture_id uuid)
returns public.league_fixtures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fixture public.league_fixtures%rowtype;
begin
  select * into v_fixture
  from public.league_fixtures f
  where f.id = p_fixture_id;

  if v_fixture.id is null then
    raise exception 'League fixture not found.';
  end if;

  perform public.league_lock_season(v_fixture.season_id);

  select * into v_fixture
  from public.league_fixtures f
  where f.id = p_fixture_id
  for update;

  return v_fixture;
end;
$$;

create or replace function public.league_lock_duel(p_duel_id uuid)
returns public.league_duels
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.league_duels%rowtype;
  v_season_id uuid;
begin
  select * into v_duel
  from public.league_duels d
  where d.id = p_duel_id;

  if v_duel.id is null then
    raise exception 'League duel not found.';
  end if;

  select f.season_id into v_season_id
  from public.league_fixtures f
  where f.id = v_duel.fixture_id;

  perform public.league_lock_season(v_season_id);

  select * into v_duel
  from public.league_duels d
  where d.id = p_duel_id
  for update;

  return v_duel;
end;
$$;

-- ============================================================================
-- 3. Evidence validation
-- ============================================================================

create or replace function public.league_validate_evidence(
  p_duel_id uuid,
  p_player_id uuid,
  p_path text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_duel public.league_duels%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_parts text[];
  v_size bigint;
  v_mime text;
begin
  if p_path is null or char_length(btrim(p_path)) = 0 or char_length(p_path) > 400 then
    raise exception 'League evidence path is required.';
  end if;
  if position('..' in p_path) > 0 or position(chr(92) in p_path) > 0 then
    raise exception 'League evidence path is not valid.';
  end if;

  select * into v_duel from public.league_duels where id = p_duel_id;
  if v_duel.id is null then
    raise exception 'League duel not found.';
  end if;
  select * into v_fixture from public.league_fixtures where id = v_duel.fixture_id;
  if v_fixture.id is null then
    raise exception 'League fixture not found.';
  end if;

  v_parts := string_to_array(p_path, '/');
  if array_length(v_parts, 1) is distinct from 5 then
    raise exception 'League evidence must use league/{season}/{fixture}/{duel}/{player}-file.';
  end if;
  if v_parts[1] <> 'league'
     or v_parts[2] <> v_fixture.season_id::text
     or v_parts[3] <> v_fixture.id::text
     or v_parts[4] <> v_duel.id::text
     or v_parts[5] not like p_player_id::text || '-%' then
    raise exception 'League evidence path does not match this duel and player.';
  end if;

  select
    case when (o.metadata->>'size') ~ '^[0-9]+$'
      then (o.metadata->>'size')::bigint else 0 end,
    coalesce(o.metadata->>'mimetype', o.metadata->>'contentType')
    into v_size, v_mime
  from storage.objects o
  where o.bucket_id = 'match-evidence'
    and o.name = p_path
    and o.owner::text = p_player_id::text;

  if v_size is null then
    raise exception 'League evidence file was not found or is not yours.';
  end if;
  if v_size < 1 or v_size > 5242880 then
    raise exception 'League evidence must be a non-empty image under 5 MB.';
  end if;
  if v_mime is null or v_mime not in ('image/jpeg','image/png','image/webp') then
    raise exception 'League evidence must be a JPEG, PNG or WebP image.';
  end if;
end;
$$;

-- ============================================================================
-- 4. Reveal and finalization (internal)
-- ============================================================================

create or replace function public.league_maybe_reveal_fixture(p_fixture_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fixture public.league_fixtures%rowtype;
  v_home_lineup public.league_lineups%rowtype;
  v_away_lineup public.league_lineups%rowtype;
  v_deadline timestamptz;
  v_slot int;
  v_home_player uuid;
  v_away_player uuid;
begin
  v_fixture := public.league_lock_fixture(p_fixture_id);

  if v_fixture.status not in ('SCHEDULED','LINEUPS_PENDING') then
    return false;
  end if;

  select * into v_home_lineup
  from public.league_lineups l
  where l.fixture_id = p_fixture_id
    and l.team_id = v_fixture.home_team_id
  for update;

  select * into v_away_lineup
  from public.league_lineups l
  where l.fixture_id = p_fixture_id
    and l.team_id = v_fixture.away_team_id
  for update;

  if v_home_lineup.id is null or v_away_lineup.id is null then
    return false;
  end if;
  if v_home_lineup.status not in ('SUBMITTED','REVEALED')
     or v_away_lineup.status not in ('SUBMITTED','REVEALED') then
    return false;
  end if;

  select m.deadline into v_deadline
  from public.league_matchdays m
  where m.id = v_fixture.matchday_id;

  if v_deadline is null then
    raise exception 'League matchday not found.';
  end if;

  for v_slot in 1..4 loop
    select lp.player_id into v_home_player
    from public.league_lineup_players lp
    where lp.lineup_id = v_home_lineup.id
      and lp.role = 'STARTER'
      and lp.slot = v_slot;

    select lp.player_id into v_away_player
    from public.league_lineup_players lp
    where lp.lineup_id = v_away_lineup.id
      and lp.role = 'STARTER'
      and lp.slot = v_slot;

    if v_home_player is null or v_away_player is null then
      raise exception 'Both lineups need four starters before reveal.';
    end if;

    insert into public.league_duels
      (fixture_id, matchday_id, slot, home_team_id, away_team_id,
       home_player_id, away_player_id, deadline)
    values
      (v_fixture.id, v_fixture.matchday_id, v_slot,
       v_fixture.home_team_id, v_fixture.away_team_id,
       v_home_player, v_away_player, v_deadline)
    on conflict (fixture_id, slot) do nothing;
  end loop;

  update public.league_lineups
    set status = 'REVEALED'
  where id in (v_home_lineup.id, v_away_lineup.id)
    and status = 'SUBMITTED';

  update public.league_fixtures
    set status = 'LINEUPS_REVEALED', revealed_at = now()
  where id = v_fixture.id;

  perform public.league_notify_team(
    v_fixture.home_team_id, 'LEAGUE_LINEUP_REVEALED',
    'League lineups revealed',
    'Both squads submitted their lineups. Your four duels are ready.',
    'league_fixture', v_fixture.id);
  perform public.league_notify_team(
    v_fixture.away_team_id, 'LEAGUE_LINEUP_REVEALED',
    'League lineups revealed',
    'Both squads submitted their lineups. Your four duels are ready.',
    'league_fixture', v_fixture.id);

  perform public.league_audit(
    v_fixture.season_id, 'LINEUPS_REVEALED', 'league_fixture', v_fixture.id,
    null, jsonb_build_object('revealed_at', now()), null);

  return true;
end;
$$;

create or replace function public.league_finalize_fixture(p_fixture_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fixture public.league_fixtures%rowtype;
  v_final_count int;
  v_home_wins int;
  v_away_wins int;
  v_home_points int;
  v_away_points int;
begin
  v_fixture := public.league_lock_fixture(p_fixture_id);

  if v_fixture.status in ('COMPLETED','FORFEITED','CANCELLED') then
    return true;
  end if;

  select count(*) into v_final_count
  from public.league_duels d
  where d.fixture_id = p_fixture_id
    and d.status in ('CONFIRMED','FORFEITED');

  if v_final_count < 4 then
    return false;
  end if;

  select
    count(*) filter (where d.winner_team_id = v_fixture.home_team_id),
    count(*) filter (where d.winner_team_id = v_fixture.away_team_id)
    into v_home_wins, v_away_wins
  from public.league_duels d
  where d.fixture_id = p_fixture_id
    and d.status in ('CONFIRMED','FORFEITED');

  v_home_points := case
    when v_home_wins > v_away_wins then 3
    when v_home_wins = v_away_wins then 1
    else 0 end;
  v_away_points := case
    when v_away_wins > v_home_wins then 3
    when v_away_wins = v_home_wins then 1
    else 0 end;

  update public.league_fixtures
    set status = 'COMPLETED',
        home_duel_wins = v_home_wins,
        away_duel_wins = v_away_wins,
        home_points = v_home_points,
        away_points = v_away_points,
        completed_at = now()
  where id = v_fixture.id;

  update public.league_matchdays m
    set status = 'COMPLETED'
  where m.id = v_fixture.matchday_id
    and m.status <> 'COMPLETED'
    and not exists (
      select 1 from public.league_fixtures f
      where f.matchday_id = m.id
        and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
    );

  perform public.league_notify_team(
    v_fixture.home_team_id, 'LEAGUE_RESULT_CONFIRMED',
    'League fixture finalized',
    'Your fixture is final: ' || v_home_wins || '-' || v_away_wins || ' duels.',
    'league_fixture', v_fixture.id);
  perform public.league_notify_team(
    v_fixture.away_team_id, 'LEAGUE_RESULT_CONFIRMED',
    'League fixture finalized',
    'Your fixture is final: ' || v_away_wins || '-' || v_home_wins || ' duels.',
    'league_fixture', v_fixture.id);

  perform public.league_audit(
    v_fixture.season_id, 'FIXTURE_FINALIZED', 'league_fixture', v_fixture.id,
    jsonb_build_object('status', v_fixture.status),
    jsonb_build_object(
      'status', 'COMPLETED', 'home_duel_wins', v_home_wins,
      'away_duel_wins', v_away_wins, 'home_points', v_home_points,
      'away_points', v_away_points),
    null);

  return true;
end;
$$;

-- ============================================================================
-- 5. Season and admin RPCs
-- ============================================================================

create or replace function public.league_create_season(
  p_name text,
  p_description text default null,
  p_registration_opens_at timestamptz default null,
  p_registration_closes_at timestamptz default null,
  p_starts_at timestamptz default null,
  p_matchday_days int default 7,
  p_min_teams int default 4,
  p_max_teams int default 8,
  p_roster_min int default 6,
  p_roster_max int default 8
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_admin();
  v_id uuid;
begin
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then
    raise exception 'Season name must be 2-80 characters.';
  end if;
  if p_description is not null and char_length(p_description) > 2000 then
    raise exception 'Season description is too long.';
  end if;
  if p_matchday_days not between 1 and 14 then
    raise exception 'Matchday length must be 1-14 days.';
  end if;
  if p_min_teams not between 4 and 16 or p_max_teams not between p_min_teams and 16 then
    raise exception 'Team limits must be 4-16 with max >= min.';
  end if;
  if p_roster_min not between 6 and 8 or p_roster_max not between p_roster_min and 8 then
    raise exception 'Roster limits must be 6-8 with max >= min.';
  end if;
  if p_registration_opens_at is not null and p_registration_closes_at is not null
     and p_registration_closes_at <= p_registration_opens_at then
    raise exception 'Registration close must be after registration open.';
  end if;
  if p_starts_at is not null and p_registration_closes_at is not null
     and p_starts_at < p_registration_closes_at then
    raise exception 'Season start must be at or after registration close.';
  end if;

  insert into public.league_seasons
    (name, description, registration_opens_at, registration_closes_at, starts_at,
     matchday_days, min_teams, max_teams, roster_min, roster_max, created_by)
  values
    (btrim(p_name), p_description, p_registration_opens_at, p_registration_closes_at,
     p_starts_at, p_matchday_days, p_min_teams, p_max_teams, p_roster_min,
     p_roster_max, v_me)
  returning id into v_id;

  perform public.league_audit(
    v_id, 'SEASON_CREATED', 'league_season', v_id, null,
    jsonb_build_object('name', btrim(p_name), 'status', 'DRAFT'), null);

  return v_id;
end;
$$;

create or replace function public.league_update_season(
  p_season_id uuid,
  p_name text,
  p_description text,
  p_registration_opens_at timestamptz,
  p_registration_closes_at timestamptz,
  p_starts_at timestamptz,
  p_matchday_days int,
  p_min_teams int,
  p_max_teams int,
  p_roster_min int,
  p_roster_max int
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
  v_team_count int;
begin
  perform public.league_require_admin();
  v_season := public.league_lock_season(p_season_id);

  if v_season.status not in ('DRAFT','REGISTRATION') then
    raise exception 'Only DRAFT or REGISTRATION seasons can be edited.';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then
    raise exception 'Season name must be 2-80 characters.';
  end if;
  if p_description is not null and char_length(p_description) > 2000 then
    raise exception 'Season description is too long.';
  end if;
  if p_matchday_days not between 1 and 14 then
    raise exception 'Matchday length must be 1-14 days.';
  end if;
  if p_min_teams not between 4 and 16 or p_max_teams not between p_min_teams and 16 then
    raise exception 'Team limits must be 4-16 with max >= min.';
  end if;
  if p_roster_min not between 6 and 8 or p_roster_max not between p_roster_min and 8 then
    raise exception 'Roster limits must be 6-8 with max >= min.';
  end if;
  if p_registration_opens_at is not null and p_registration_closes_at is not null
     and p_registration_closes_at <= p_registration_opens_at then
    raise exception 'Registration close must be after registration open.';
  end if;
  if p_starts_at is not null and p_registration_closes_at is not null
     and p_starts_at < p_registration_closes_at then
    raise exception 'Season start must be at or after registration close.';
  end if;

  if (p_starts_at is distinct from v_season.starts_at
      or p_matchday_days <> v_season.matchday_days)
     and exists (
       select 1 from public.league_matchdays m
       where m.season_id = p_season_id
     ) then
    raise exception 'Regenerate fixtures before changing the start or matchday length.';
  end if;

  select count(*) into v_team_count
  from public.league_teams t
  where t.season_id = p_season_id and t.status in ('PENDING','APPROVED');
  if v_team_count > p_max_teams then
    raise exception 'There are already % squads; max teams cannot be lower.', v_team_count;
  end if;

  if exists (
    select 1
    from public.league_teams t
    where t.season_id = p_season_id and t.status = 'APPROVED'
      and (select count(*) from public.league_team_members m
           where m.team_id = t.id and m.status = 'ACTIVE')
          not between p_roster_min and p_roster_max
  ) then
    raise exception 'An approved squad would fall outside the new roster limits.';
  end if;

  update public.league_seasons
    set name = btrim(p_name),
        description = p_description,
        registration_opens_at = p_registration_opens_at,
        registration_closes_at = p_registration_closes_at,
        starts_at = p_starts_at,
        matchday_days = p_matchday_days,
        min_teams = p_min_teams,
        max_teams = p_max_teams,
        roster_min = p_roster_min,
        roster_max = p_roster_max
  where id = p_season_id;

  perform public.league_audit(
    p_season_id, 'SEASON_UPDATED', 'league_season', p_season_id,
    jsonb_build_object(
      'name', v_season.name, 'starts_at', v_season.starts_at,
      'min_teams', v_season.min_teams, 'max_teams', v_season.max_teams,
      'roster_min', v_season.roster_min, 'roster_max', v_season.roster_max),
    jsonb_build_object(
      'name', btrim(p_name), 'starts_at', p_starts_at,
      'min_teams', p_min_teams, 'max_teams', p_max_teams,
      'roster_min', p_roster_min, 'roster_max', p_roster_max),
    null);
end;
$$;

create or replace function public.league_set_season_status(
  p_season_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
  v_target text := upper(coalesce(p_status, ''));
  v_teams int;
  v_expected_matchdays int;
  v_expected_fixtures int;
begin
  perform public.league_require_admin();
  v_season := public.league_lock_season(p_season_id);

  if v_target not in ('DRAFT','REGISTRATION','ACTIVE','COMPLETED','ARCHIVED') then
    raise exception 'Unknown league season status: %', p_status;
  end if;
  if v_season.status = v_target then
    return;
  end if;
  if not (
    (v_season.status = 'DRAFT' and v_target = 'REGISTRATION')
    or (v_season.status = 'REGISTRATION' and v_target = 'ACTIVE')
    or (v_season.status = 'ACTIVE' and v_target = 'COMPLETED')
    or (v_season.status = 'COMPLETED' and v_target = 'ARCHIVED')
  ) then
    raise exception 'Invalid league season transition: % -> %.', v_season.status, v_target;
  end if;

  if v_target = 'REGISTRATION' then
    if v_season.registration_closes_at is not null
       and v_season.registration_closes_at <= now() then
      raise exception 'Registration close must be in the future.';
    end if;
    update public.league_seasons
      set status = 'REGISTRATION',
          registration_opens_at = coalesce(registration_opens_at, now())
    where id = p_season_id;
  elsif v_target = 'ACTIVE' then
    select count(*) into v_teams
    from public.league_teams t
    where t.season_id = p_season_id and t.status = 'APPROVED';

    if v_teams < v_season.min_teams or v_teams > v_season.max_teams then
      raise exception 'An active season needs %-% approved squads (has %).',
        v_season.min_teams, v_season.max_teams, v_teams;
    end if;
    if v_season.starts_at is null then
      raise exception 'Set the season start before activating it.';
    end if;
    if exists (
      select 1 from public.league_teams t
      where t.season_id = p_season_id and t.status = 'APPROVED'
        and (select count(*) from public.league_team_members m
             where m.team_id = t.id and m.status = 'ACTIVE')
            not between v_season.roster_min and v_season.roster_max
    ) then
      raise exception 'Every approved squad must be within roster limits.';
    end if;

    v_expected_matchdays := case
      when mod(v_teams, 2) = 0 then 2 * (v_teams - 1)
      else 2 * v_teams end;
    v_expected_fixtures := v_teams * (v_teams - 1);

    if (select count(*) from public.league_matchdays m where m.season_id = p_season_id)
       <> v_expected_matchdays then
      raise exception 'Generate fixtures first: expected % matchdays.', v_expected_matchdays;
    end if;
    if (select count(*) from public.league_fixtures f where f.season_id = p_season_id)
       <> v_expected_fixtures then
      raise exception 'Generate fixtures first: expected % fixtures.', v_expected_fixtures;
    end if;

    update public.league_seasons set status = 'ACTIVE' where id = p_season_id;
  elsif v_target = 'COMPLETED' then
    if exists (
      select 1 from public.league_fixtures f
      where f.season_id = p_season_id
        and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
    ) then
      raise exception 'Every fixture must be final before the season is completed.';
    end if;
    update public.league_seasons set status = 'COMPLETED' where id = p_season_id;
    update public.league_matchdays set status = 'COMPLETED'
    where season_id = p_season_id and status <> 'COMPLETED';
  else
    update public.league_seasons set status = 'ARCHIVED' where id = p_season_id;
  end if;

  perform public.league_audit(
    p_season_id, 'SEASON_STATUS_CHANGED', 'league_season', p_season_id,
    jsonb_build_object('status', v_season.status),
    jsonb_build_object('status', v_target), p_reason);

  perform public.league_notify_season(
    p_season_id, 'LEAGUE_SEASON_STATUS',
    'League season updated',
    'The 4vs4 season is now ' || v_target || '.',
    'league_season', p_season_id);
end;
$$;

create or replace function public.league_generate_fixtures(
  p_season_id uuid,
  p_reset boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_season public.league_seasons%rowtype;
  v_teams uuid[];
  v_team_count int;
  v_slots int;
  v_rounds int;
  v_total_matchdays int;
  v_matchday_ids uuid[] := '{}';
  v_md int;
  v_r int;
  v_i int;
  v_j int;
  v_a uuid;
  v_b uuid;
  v_home uuid;
  v_away uuid;
  v_bye uuid;
  v_last uuid;
  v_new_id uuid;
begin
  perform public.league_require_admin();
  v_season := public.league_lock_season(p_season_id);

  if v_season.status not in ('DRAFT','REGISTRATION','ACTIVE') then
    raise exception 'Fixtures cannot be generated for a % season.', v_season.status;
  end if;
  if v_season.starts_at is null then
    raise exception 'Set the season start before generating fixtures.';
  end if;

  select array_agg(t.id order by lower(t.name), t.id) into v_teams
  from public.league_teams t
  where t.season_id = p_season_id and t.status = 'APPROVED';

  v_team_count := coalesce(array_length(v_teams, 1), 0);
  if v_team_count < v_season.min_teams or v_team_count > v_season.max_teams then
    raise exception 'Fixture generation needs %-% approved squads (has %).',
      v_season.min_teams, v_season.max_teams, v_team_count;
  end if;

  if exists (select 1 from public.league_matchdays m where m.season_id = p_season_id)
     or exists (select 1 from public.league_fixtures f where f.season_id = p_season_id) then
    if not coalesce(p_reset, false) then
      raise exception 'Fixtures already exist. Pass p_reset = true to replace a clean schedule.';
    end if;
    if exists (
      select 1 from public.league_fixtures f
      where f.season_id = p_season_id and f.status <> 'SCHEDULED'
    ) or exists (
      select 1 from public.league_lineups l
      join public.league_fixtures f on f.id = l.fixture_id
      where f.season_id = p_season_id
    ) or exists (
      select 1 from public.league_duels d
      join public.league_fixtures f on f.id = d.fixture_id
      where f.season_id = p_season_id
    ) then
      raise exception 'A started or reported schedule cannot be reset.';
    end if;
    delete from public.league_matchdays where season_id = p_season_id;
  end if;

  if mod(v_team_count, 2) = 1 then
    v_teams := array_append(v_teams, null::uuid);
  end if;
  v_slots := array_length(v_teams, 1);
  v_rounds := v_slots - 1;
  v_total_matchdays := 2 * v_rounds;

  for v_md in 1..v_total_matchdays loop
    insert into public.league_matchdays
      (season_id, number, opens_at, deadline)
    values
      (p_season_id, v_md,
       v_season.starts_at + ((v_md - 1) * v_season.matchday_days) * interval '1 day',
       v_season.starts_at + (v_md * v_season.matchday_days) * interval '1 day')
    returning id into v_new_id;
    v_matchday_ids := array_append(v_matchday_ids, v_new_id);
  end loop;

  for v_r in 0..(v_rounds - 1) loop
    for v_i in 0..((v_slots / 2) - 1) loop
      v_a := v_teams[v_i + 1];
      v_b := v_teams[v_slots - v_i];

      if v_a is null then
        v_bye := v_b;
      elsif v_b is null then
        v_bye := v_a;
      else
        v_bye := null;
      end if;

      if v_bye is not null then
        insert into public.league_byes (season_id, matchday_id, team_id)
        values (p_season_id, v_matchday_ids[v_r + 1], v_bye)
        on conflict do nothing;
        insert into public.league_byes (season_id, matchday_id, team_id)
        values (p_season_id, v_matchday_ids[v_rounds + v_r + 1], v_bye)
        on conflict do nothing;
      else
        if mod(v_r + v_i, 2) = 0 then
          v_home := v_a;
          v_away := v_b;
        else
          v_home := v_b;
          v_away := v_a;
        end if;

        insert into public.league_fixtures
          (season_id, matchday_id, leg, home_team_id, away_team_id)
        values
          (p_season_id, v_matchday_ids[v_r + 1], 1, v_home, v_away);
        insert into public.league_fixtures
          (season_id, matchday_id, leg, home_team_id, away_team_id)
        values
          (p_season_id, v_matchday_ids[v_rounds + v_r + 1], 2, v_away, v_home);
      end if;
    end loop;

    v_last := v_teams[v_slots];
    for v_j in reverse 3..v_slots loop
      v_teams[v_j] := v_teams[v_j - 1];
    end loop;
    v_teams[2] := v_last;
  end loop;

  perform public.league_audit(
    p_season_id, 'FIXTURES_GENERATED', 'league_season', p_season_id,
    null,
    jsonb_build_object(
      'teams', v_team_count, 'matchdays', v_total_matchdays,
      'fixtures', v_team_count * (v_team_count - 1)),
    null);
end;
$$;

create or replace function public.league_extend_matchday(
  p_matchday_id uuid,
  p_new_deadline timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_matchday public.league_matchdays%rowtype;
  v_season_status text;
  r record;
begin
  perform public.league_require_admin();
  v_matchday := public.league_lock_matchday(p_matchday_id);
  select s.status into v_season_status
  from public.league_seasons s where s.id = v_matchday.season_id;

  if v_season_status not in ('REGISTRATION','ACTIVE') then
    raise exception 'Deadlines cannot be extended in a % season.', v_season_status;
  end if;
  if v_matchday.status = 'COMPLETED' then
    raise exception 'This matchday is already completed.';
  end if;
  if p_new_deadline is null or p_new_deadline <= v_matchday.deadline then
    raise exception 'The new deadline must extend the current deadline.';
  end if;
  if p_new_deadline <= v_matchday.opens_at then
    raise exception 'The deadline must be after the matchday opens.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;

  update public.league_matchdays
    set deadline = p_new_deadline,
        status = case
          when status = 'CLOSED' and p_new_deadline > now() then 'OPEN'
          else status end
  where id = p_matchday_id;

  update public.league_duels d
    set deadline = p_new_deadline
  from public.league_fixtures f
  where f.id = d.fixture_id
    and f.matchday_id = p_matchday_id
    and d.status not in ('CONFIRMED','FORFEITED','CANCELLED');

  for r in
    select distinct f.home_team_id as team_id from public.league_fixtures f
    where f.matchday_id = p_matchday_id
    union
    select distinct f.away_team_id from public.league_fixtures f
    where f.matchday_id = p_matchday_id
  loop
    perform public.league_notify_team(
      r.team_id, 'LEAGUE_MATCHDAY_EXTENDED',
      'League deadline extended',
      'Your matchday deadline was extended to ' || p_new_deadline::text || '.',
      'league_matchday', p_matchday_id);
  end loop;

  perform public.league_audit(
    v_matchday.season_id, 'MATCHDAY_EXTENDED', 'league_matchday', p_matchday_id,
    jsonb_build_object('deadline', v_matchday.deadline),
    jsonb_build_object('deadline', p_new_deadline), p_reason);
end;
$$;

create or replace function public.league_approve_team(
  p_team_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_admin();
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_approved int;
  v_roster int;
begin
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Squads can only be approved during registration.';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Admin note is too long.';
  end if;
  if p_approve is null then
    raise exception 'Choose whether to approve or reject the squad.';
  end if;
  if (p_approve and v_team.status = 'APPROVED')
     or (not p_approve and v_team.status = 'REJECTED') then
    return;
  end if;
  if v_team.status <> 'PENDING' then
    raise exception 'Only PENDING squads can be reviewed.';
  end if;

  if p_approve then
    select count(*) into v_approved
    from public.league_teams t
    where t.season_id = v_team.season_id and t.status = 'APPROVED';
    if v_approved >= v_season.max_teams then
      raise exception 'This season already has the maximum number of approved squads.';
    end if;

    select count(*) into v_roster
    from public.league_team_members m
    where m.team_id = p_team_id and m.status = 'ACTIVE';
    if v_roster not between v_season.roster_min and v_season.roster_max then
      raise exception 'The squad must have %-% active players before approval.',
        v_season.roster_min, v_season.roster_max;
    end if;

    update public.league_teams
      set status = 'APPROVED', approved_by = v_me, approved_at = now(),
          admin_note = p_note
    where id = p_team_id;

    perform public.league_notify_team(
      p_team_id, 'LEAGUE_TEAM_APPROVED',
      'League squad approved',
      'Your 4vs4 squad is approved for the season.',
      'league_team', p_team_id);
  else
    perform public.league_notify_team(
      p_team_id, 'LEAGUE_TEAM_REJECTED',
      'League squad rejected',
      coalesce('Your 4vs4 squad was rejected. ' || nullif(p_note, ''), 'Your 4vs4 squad was rejected.'),
      'league_team', p_team_id);

    update public.league_teams
      set status = 'REJECTED', approved_by = v_me, approved_at = now(),
          admin_note = p_note
    where id = p_team_id;

    update public.league_team_members
      set status = 'LEFT', left_at = now()
    where team_id = p_team_id and status = 'ACTIVE';

    update public.league_team_invites
      set status = 'REVOKED', responded_at = now()
    where team_id = p_team_id and status = 'PENDING';
  end if;

  perform public.league_audit(
    v_team.season_id, 'TEAM_REVIEWED', 'league_team', p_team_id,
    jsonb_build_object('status', v_team.status),
    jsonb_build_object('status', case when p_approve then 'APPROVED' else 'REJECTED' end),
    p_note);
end;
$$;

create or replace function public.league_replace_member(
  p_team_id uuid,
  p_out_player_id uuid,
  p_in_player_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_out public.league_team_members%rowtype;
  v_role text;
begin
  perform public.league_require_admin();
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status not in ('REGISTRATION','ACTIVE') then
    raise exception 'Members cannot be replaced in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'Members cannot be replaced on a % squad.', v_team.status;
  end if;
  if v_season.status = 'ACTIVE' and exists (
    select 1 from public.league_matchdays m
    where m.season_id = v_team.season_id
      and m.status <> 'COMPLETED'
      and now() >= m.opens_at and now() < m.deadline
  ) then
    raise exception 'Replacements must be completed between matchdays.';
  end if;
  if p_out_player_id = p_in_player_id then
    raise exception 'Choose a different replacement player.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;

  select * into v_out
  from public.league_team_members m
  where m.team_id = p_team_id and m.player_id = p_out_player_id
    and m.status = 'ACTIVE'
  for update;
  if v_out.id is null then
    raise exception 'The outgoing player is not an active squad member.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_in_player_id and p.status = 'ACTIVE'
  ) then
    raise exception 'The replacement must be an ACTIVE clan member.';
  end if;
  if exists (
    select 1 from public.league_team_members m
    where m.season_id = v_team.season_id and m.player_id = p_in_player_id
      and m.status = 'ACTIVE'
  ) then
    raise exception 'The replacement already has an active squad this season.';
  end if;
  if exists (
    select 1 from public.league_duels d
    where (d.home_player_id = p_out_player_id or d.away_player_id = p_out_player_id)
      and d.status not in ('CONFIRMED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Resolve or substitute the outgoing player''s open duel first.';
  end if;
  if exists (
    select 1
    from public.league_lineup_players lp
    join public.league_lineups l on l.id = lp.lineup_id
    join public.league_fixtures f on f.id = l.fixture_id
    where l.team_id = p_team_id and lp.player_id = p_out_player_id
      and l.status in ('SUBMITTED','REVEALED')
      and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Update the submitted lineup before replacing this player.';
  end if;

  v_role := case when v_out.role = 'CAPTAIN' then 'CAPTAIN' else 'PLAYER' end;

  update public.league_team_members
    set status = 'REPLACED', left_at = now(),
        replaced_by = p_in_player_id, replaced_at = now()
  where id = v_out.id;

  insert into public.league_team_members
    (season_id, team_id, player_id, role, status)
  values
    (v_team.season_id, p_team_id, p_in_player_id, v_role, 'ACTIVE');

  update public.league_team_invites
    set status = 'ACCEPTED', responded_at = now()
  where team_id = p_team_id and player_id = p_in_player_id and status = 'PENDING';

  if v_out.role = 'CAPTAIN' then
    update public.league_teams
      set captain_id = p_in_player_id
    where id = p_team_id;
  end if;

  perform public.league_notify(
    p_out_player_id, 'LEAGUE_ROSTER_CHANGED',
    'League squad changed',
    'You were replaced in your 4vs4 squad.',
    'league_team', p_team_id);
  perform public.league_notify(
    p_in_player_id, 'LEAGUE_ROSTER_CHANGED',
    'League squad changed',
    'You joined a 4vs4 squad as a replacement.',
    'league_team', p_team_id);

  perform public.league_audit(
    v_team.season_id, 'MEMBER_REPLACED', 'league_team', p_team_id,
    jsonb_build_object('out_player_id', p_out_player_id, 'role', v_out.role),
    jsonb_build_object('in_player_id', p_in_player_id, 'role', v_role),
    p_reason);
end;
$$;

create or replace function public.league_apply_penalty(
  p_season_id uuid,
  p_team_id uuid,
  p_points int,
  p_reason text,
  p_matchday_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_admin();
  v_season public.league_seasons%rowtype;
  v_team public.league_teams%rowtype;
  v_id uuid;
  v_team_name text;
begin
  v_season := public.league_lock_season(p_season_id);

  if v_season.status = 'ARCHIVED' then
    raise exception 'Archived seasons cannot be penalized.';
  end if;
  if p_points is null or p_points = 0 or p_points not between -100 and 100 then
    raise exception 'Penalty points must be a non-zero value between -100 and 100.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;

  select * into v_team from public.league_teams t
  where t.id = p_team_id and t.season_id = p_season_id;
  if v_team.id is null then
    raise exception 'Squad is not part of this season.';
  end if;
  v_team_name := v_team.name;

  if p_matchday_id is not null and not exists (
    select 1 from public.league_matchdays m
    where m.id = p_matchday_id and m.season_id = p_season_id
  ) then
    raise exception 'Matchday is not part of this season.';
  end if;

  insert into public.league_penalties
    (season_id, team_id, matchday_id, points, reason, created_by)
  values
    (p_season_id, p_team_id, p_matchday_id, p_points, btrim(p_reason), v_me)
  returning id into v_id;

  perform public.league_notify_team(
    p_team_id, 'LEAGUE_SANCTION',
    'League sanction',
    v_team_name || ' received a ' || p_points || ' point adjustment: ' || btrim(p_reason),
    'league_team', p_team_id);

  perform public.league_audit(
    p_season_id, 'PENALTY_APPLIED', 'league_team', p_team_id,
    null, jsonb_build_object('points', p_points, 'matchday_id', p_matchday_id),
    p_reason);

  return v_id;
end;
$$;

create or replace function public.league_set_tiebreak_order(
  p_season_id uuid,
  p_team_ids uuid[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_admin();
  v_season public.league_seasons%rowtype;
  v_count int;
  v_match int;
  v_old jsonb;
  v_i int;
begin
  v_season := public.league_lock_season(p_season_id);

  if v_season.status not in ('ACTIVE','COMPLETED') then
    raise exception 'Tiebreak order can only be set for an active or completed season.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;
  if p_team_ids is null or array_length(p_team_ids, 1) is null then
    raise exception 'Provide the ordered squad ids.';
  end if;

  v_count := array_length(p_team_ids, 1);
  if array_position(p_team_ids, null) is not null then
    raise exception 'Tiebreak order cannot contain null ids.';
  end if;
  if (select count(distinct x) from unnest(p_team_ids) x) <> v_count then
    raise exception 'Tiebreak order contains duplicate squads.';
  end if;
  if v_count <> (
    select count(*) from public.league_teams t
    where t.season_id = p_season_id and t.status = 'APPROVED'
  ) then
    raise exception 'Tiebreak order must include every approved squad.';
  end if;

  select count(*) into v_match
  from public.league_teams t
  where t.season_id = p_season_id and t.status = 'APPROVED'
    and t.id = any(p_team_ids);
  if v_match <> v_count then
    raise exception 'Tiebreak order contains a squad outside this season.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('team_id', o.team_id, 'position', o.position)), '[]'::jsonb)
    into v_old
  from public.league_tiebreak_orders o
  where o.season_id = p_season_id;

  delete from public.league_tiebreak_orders where season_id = p_season_id;
  for v_i in 1..v_count loop
    insert into public.league_tiebreak_orders
      (season_id, team_id, position, reason, created_by)
    values
      (p_season_id, p_team_ids[v_i], v_i, btrim(p_reason), v_me);
  end loop;

  perform public.league_audit(
    p_season_id, 'TIEBREAK_ORDER_SET', 'league_season', p_season_id,
    v_old, jsonb_build_object('team_ids', p_team_ids), p_reason);
end;
$$;

-- ============================================================================
-- 6. Team, roster and roster-admin RPCs
-- ============================================================================

create or replace function public.league_create_team(
  p_season_id uuid,
  p_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season public.league_seasons%rowtype;
  v_active_teams int;
  v_id uuid;
begin
  v_season := public.league_lock_season(p_season_id);

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Squads can only be created during registration.';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 40 then
    raise exception 'Squad name must be 2-40 characters.';
  end if;
  if exists (
    select 1 from public.league_teams t
    where t.season_id = p_season_id and lower(t.name) = lower(btrim(p_name))
  ) then
    raise exception 'That squad name is already in use this season.';
  end if;
  if exists (
    select 1 from public.league_team_members m
    where m.season_id = p_season_id and m.player_id = v_me and m.status = 'ACTIVE'
  ) then
    raise exception 'You already have an active squad this season.';
  end if;

  select count(*) into v_active_teams
  from public.league_teams t
  where t.season_id = p_season_id and t.status in ('PENDING','APPROVED');
  if v_active_teams >= v_season.max_teams then
    raise exception 'This season already has the maximum number of squads.';
  end if;

  insert into public.league_teams (season_id, name, captain_id, status)
  values (p_season_id, btrim(p_name), v_me, 'PENDING')
  returning id into v_id;

  insert into public.league_team_members
    (season_id, team_id, player_id, role, status)
  values
    (p_season_id, v_id, v_me, 'CAPTAIN', 'ACTIVE');

  perform public.league_audit(
    p_season_id, 'TEAM_CREATED', 'league_team', v_id, null,
    jsonb_build_object('name', btrim(p_name), 'captain_id', v_me), null);

  return v_id;
end;
$$;

create or replace function public.league_update_team(
  p_team_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
begin
  perform public.league_require_captain(p_team_id);
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status not in ('REGISTRATION','ACTIVE') then
    raise exception 'Squad details cannot be edited in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad can no longer be edited.';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 40 then
    raise exception 'Squad name must be 2-40 characters.';
  end if;
  if exists (
    select 1 from public.league_teams t
    where t.season_id = v_team.season_id and t.id <> p_team_id
      and lower(t.name) = lower(btrim(p_name))
  ) then
    raise exception 'That squad name is already in use this season.';
  end if;

  update public.league_teams set name = btrim(p_name) where id = p_team_id;

  perform public.league_audit(
    v_team.season_id, 'TEAM_UPDATED', 'league_team', p_team_id,
    jsonb_build_object('name', v_team.name),
    jsonb_build_object('name', btrim(p_name)), null);
end;
$$;

create or replace function public.league_invite_member(
  p_team_id uuid,
  p_player_id uuid,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_captain(p_team_id);
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_active int;
  v_id uuid;
begin
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Invites are closed in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad can no longer invite players.';
  end if;
  if p_player_id = v_me then
    raise exception 'You cannot invite yourself.';
  end if;
  if p_message is not null and char_length(p_message) > 500 then
    raise exception 'Invite message is too long.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_player_id and p.status = 'ACTIVE'
  ) then
    raise exception 'You can only invite ACTIVE clan members.';
  end if;
  if exists (
    select 1 from public.league_team_members m
    where m.season_id = v_team.season_id and m.player_id = p_player_id
      and m.status = 'ACTIVE'
  ) then
    raise exception 'That player already has an active squad this season.';
  end if;

  update public.league_team_invites
    set status = 'EXPIRED', responded_at = now()
  where team_id = p_team_id and player_id = p_player_id
    and status = 'PENDING' and expires_at is not null and expires_at <= now();

  if exists (
    select 1 from public.league_team_invites i
    where i.team_id = p_team_id and i.player_id = p_player_id
      and i.status = 'PENDING'
  ) then
    raise exception 'That player already has a pending invite from this squad.';
  end if;

  select count(*) into v_active
  from public.league_team_members m
  where m.team_id = p_team_id and m.status = 'ACTIVE';
  if v_active >= v_season.roster_max then
    raise exception 'Your squad is already full (max % players).', v_season.roster_max;
  end if;

  insert into public.league_team_invites
    (season_id, team_id, player_id, invited_by, message, expires_at)
  values
    (v_team.season_id, p_team_id, p_player_id, v_me, nullif(btrim(p_message), ''),
     now() + interval '7 days')
  returning id into v_id;

  perform public.league_notify(
    p_player_id, 'LEAGUE_INVITE',
    '4vs4 squad invite',
    'You were invited to join ' || v_team.name || '.',
    'league_team', p_team_id);

  perform public.league_audit(
    v_team.season_id, 'INVITE_SENT', 'league_team', p_team_id, null,
    jsonb_build_object('player_id', p_player_id, 'invite_id', v_id), null);

  return v_id;
end;
$$;

create or replace function public.league_answer_invite(
  p_invite_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_invite public.league_team_invites%rowtype;
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_active int;
begin
  select * into v_invite
  from public.league_team_invites i
  where i.id = p_invite_id;
  if v_invite.id is null then
    raise exception 'Invite not found.';
  end if;
  if v_invite.player_id <> v_me then
    raise exception 'This invite belongs to another player.';
  end if;

  v_season := public.league_lock_season(v_invite.season_id);
  v_team := public.league_lock_team(v_invite.team_id);

  select * into v_invite
  from public.league_team_invites i
  where i.id = p_invite_id
  for update;
  if v_invite.player_id <> v_me then
    raise exception 'This invite belongs to another player.';
  end if;
  if v_invite.status <> 'PENDING' then
    raise exception 'This invite is no longer pending.';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'This invite has expired.';
  end if;

  if not coalesce(p_accept, false) then
    update public.league_team_invites
      set status = 'DECLINED', responded_at = now()
    where id = p_invite_id;
    perform public.league_audit(
      v_team.season_id, 'INVITE_DECLINED', 'league_team', v_team.id, null,
      jsonb_build_object('player_id', v_me, 'invite_id', p_invite_id), null);
    return;
  end if;

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Invites cannot be accepted in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad can no longer accept players.';
  end if;
  if exists (
    select 1 from public.league_team_members m
    where m.season_id = v_team.season_id and m.player_id = v_me
      and m.status = 'ACTIVE'
  ) then
    raise exception 'You already have an active squad this season.';
  end if;

  select count(*) into v_active
  from public.league_team_members m
  where m.team_id = v_team.id and m.status = 'ACTIVE';
  if v_active >= v_season.roster_max then
    raise exception 'This squad is already full.';
  end if;

  update public.league_team_invites
    set status = 'ACCEPTED', responded_at = now()
  where id = p_invite_id;

  insert into public.league_team_members
    (season_id, team_id, player_id, role, status)
  values
    (v_team.season_id, v_team.id, v_me, 'PLAYER', 'ACTIVE');

  perform public.league_notify(
    v_team.captain_id, 'LEAGUE_ROSTER_CHANGED',
    'League squad changed',
    'A player accepted your 4vs4 squad invite.',
    'league_team', v_team.id);

  perform public.league_audit(
    v_team.season_id, 'INVITE_ACCEPTED', 'league_team', v_team.id, null,
    jsonb_build_object('player_id', v_me, 'invite_id', p_invite_id), null);
end;
$$;

create or replace function public.league_leave_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_member public.league_team_members%rowtype;
  v_active int;
begin
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Rosters are locked; contact an admin for a replacement.';
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad is no longer active.';
  end if;

  select * into v_member
  from public.league_team_members m
  where m.team_id = p_team_id and m.player_id = v_me and m.status = 'ACTIVE'
  for update;
  if v_member.id is null then
    raise exception 'You are not an active member of this squad.';
  end if;
  if exists (
    select 1 from public.league_duels d
    where (d.home_player_id = v_me or d.away_player_id = v_me)
      and d.status not in ('CONFIRMED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Resolve or substitute your open duel before leaving.';
  end if;
  if exists (
    select 1
    from public.league_lineup_players lp
    join public.league_lineups l on l.id = lp.lineup_id
    join public.league_fixtures f on f.id = l.fixture_id
    where l.team_id = p_team_id and lp.player_id = v_me
      and l.status in ('SUBMITTED','REVEALED')
      and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Ask your captain to update the submitted lineup first.';
  end if;

  select count(*) into v_active
  from public.league_team_members m
  where m.team_id = p_team_id and m.status = 'ACTIVE';

  if v_member.role = 'CAPTAIN' then
    if v_active > 1 then
      raise exception 'Transfer the captaincy before leaving the squad.';
    end if;

    perform public.league_notify_team(
      p_team_id, 'LEAGUE_TEAM_WITHDRAWN',
      'League squad withdrawn',
      v_team.name || ' withdrew from the season.',
      'league_team', p_team_id);

    update public.league_teams set status = 'WITHDRAWN' where id = p_team_id;
    update public.league_team_invites
      set status = 'REVOKED', responded_at = now()
    where team_id = p_team_id and status = 'PENDING';
  end if;

  update public.league_team_members
    set status = 'LEFT', left_at = now()
  where id = v_member.id;

  if v_member.role <> 'CAPTAIN' then
    perform public.league_notify(
      v_team.captain_id, 'LEAGUE_ROSTER_CHANGED',
      'League squad changed',
      'A player left your 4vs4 squad.',
      'league_team', p_team_id);
  end if;

  perform public.league_audit(
    v_team.season_id, 'MEMBER_LEFT', 'league_team', p_team_id,
    jsonb_build_object('player_id', v_me, 'role', v_member.role), null, null);
end;
$$;

create or replace function public.league_remove_member(
  p_team_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_member public.league_team_members%rowtype;
begin
  perform public.league_require_captain(p_team_id);
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status <> 'REGISTRATION' then
    raise exception 'Rosters are locked; contact an admin for a replacement.';
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad is no longer active.';
  end if;
  if p_player_id = v_team.captain_id then
    raise exception 'The captain cannot remove themselves.';
  end if;

  select * into v_member
  from public.league_team_members m
  where m.team_id = p_team_id and m.player_id = p_player_id and m.status = 'ACTIVE'
  for update;
  if v_member.id is null then
    raise exception 'That player is not an active squad member.';
  end if;
  if exists (
    select 1 from public.league_duels d
    where (d.home_player_id = p_player_id or d.away_player_id = p_player_id)
      and d.status not in ('CONFIRMED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Resolve or substitute the player''s open duel first.';
  end if;
  if exists (
    select 1
    from public.league_lineup_players lp
    join public.league_lineups l on l.id = lp.lineup_id
    join public.league_fixtures f on f.id = l.fixture_id
    where l.team_id = p_team_id and lp.player_id = p_player_id
      and l.status in ('SUBMITTED','REVEALED')
      and f.status not in ('COMPLETED','FORFEITED','CANCELLED')
  ) then
    raise exception 'Update the submitted lineup before removing this player.';
  end if;

  update public.league_team_members
    set status = 'REMOVED', left_at = now()
  where id = v_member.id;

  perform public.league_notify(
    p_player_id, 'LEAGUE_ROSTER_CHANGED',
    'League squad changed',
    'You were removed from your 4vs4 squad.',
    'league_team', p_team_id);

  perform public.league_audit(
    v_team.season_id, 'MEMBER_REMOVED', 'league_team', p_team_id,
    jsonb_build_object('player_id', p_player_id), null, null);
end;
$$;

create or replace function public.league_transfer_captain(
  p_team_id uuid,
  p_new_captain_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team public.league_teams%rowtype;
  v_season public.league_seasons%rowtype;
  v_new public.league_team_members%rowtype;
begin
  perform public.league_require_captain(p_team_id);
  v_team := public.league_lock_team(p_team_id);
  select * into v_season from public.league_seasons where id = v_team.season_id;

  if v_season.status not in ('REGISTRATION','ACTIVE') then
    raise exception 'Captaincy cannot change in a % season.', v_season.status;
  end if;
  if v_team.status not in ('PENDING','APPROVED') then
    raise exception 'This squad is no longer active.';
  end if;
  if p_new_captain_id = v_team.captain_id then
    raise exception 'That player is already the captain.';
  end if;

  select * into v_new
  from public.league_team_members m
  where m.team_id = p_team_id and m.player_id = p_new_captain_id
    and m.status = 'ACTIVE'
  for update;
  if v_new.id is null then
    raise exception 'The new captain must be an active squad member.';
  end if;

  update public.league_team_members
    set role = 'PLAYER'
  where team_id = p_team_id and player_id = v_team.captain_id and status = 'ACTIVE';
  update public.league_team_members
    set role = 'CAPTAIN'
  where id = v_new.id;
  update public.league_teams
    set captain_id = p_new_captain_id
  where id = p_team_id;

  perform public.league_notify(
    p_new_captain_id, 'LEAGUE_CAPTAIN_CHANGED',
    'League captaincy changed',
    'You are now the captain of ' || v_team.name || '.',
    'league_team', p_team_id);
  perform public.league_notify(
    v_team.captain_id, 'LEAGUE_CAPTAIN_CHANGED',
    'League captaincy changed',
    'Your 4vs4 squad has a new captain.',
    'league_team', p_team_id);

  perform public.league_audit(
    v_team.season_id, 'CAPTAIN_TRANSFERRED', 'league_team', p_team_id,
    jsonb_build_object('captain_id', v_team.captain_id),
    jsonb_build_object('captain_id', p_new_captain_id), null);
end;
$$;

-- ============================================================================
-- 7. Lineup and duel RPCs
-- ============================================================================

create or replace function public.league_submit_lineup(
  p_fixture_id uuid,
  p_players jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_matchday public.league_matchdays%rowtype;
  v_team_id uuid;
  v_lineup public.league_lineups%rowtype;
  v_starters int;
  v_subs int;
begin
  select f.season_id into v_season_id
  from public.league_fixtures f where f.id = p_fixture_id;
  if v_season_id is null then
    raise exception 'League fixture not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(p_fixture_id);
  select * into v_matchday from public.league_matchdays m
  where m.id = v_fixture.matchday_id;

  if v_season.status <> 'ACTIVE' then
    raise exception 'Lineups can only be submitted in an active season.';
  end if;
  if v_fixture.status not in ('SCHEDULED','LINEUPS_PENDING') then
    raise exception 'This fixture is no longer accepting lineups.';
  end if;
  if now() > v_matchday.deadline or v_matchday.status in ('CLOSED','COMPLETED') then
    raise exception 'The matchday deadline has passed.';
  end if;

  select t.id into v_team_id
  from public.league_teams t
  where t.id in (v_fixture.home_team_id, v_fixture.away_team_id)
    and t.captain_id = v_me and t.status = 'APPROVED';
  if v_team_id is null then
    raise exception 'Only the squad captain can submit this lineup.';
  end if;

  if p_players is null or jsonb_typeof(p_players) <> 'array' then
    raise exception 'Lineup must be a JSON array.';
  end if;
  if jsonb_array_length(p_players) not between 6 and 8 then
    raise exception 'Lineup must contain 6-8 players (4 starters, 2-4 substitutes).';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_players) e
    where jsonb_typeof(e) <> 'object'
      or e->>'player_id' is null
      or e->>'role' is null
      or e->>'role' not in ('STARTER','SUB')
      or e->>'slot' is null
      or (e->>'slot') !~ '^[1-4]$'
  ) then
    raise exception 'Every lineup entry needs player_id, role (STARTER/SUB) and slot 1-4.';
  end if;

  select
    count(*) filter (where e->>'role' = 'STARTER'),
    count(*) filter (where e->>'role' = 'SUB')
    into v_starters, v_subs
  from jsonb_array_elements(p_players) e;
  if v_starters <> 4 then
    raise exception 'A league lineup needs exactly 4 starters.';
  end if;
  if v_subs not between 2 and 4 then
    raise exception 'A league lineup needs 2-4 substitutes.';
  end if;

  if (select count(*) from jsonb_array_elements(p_players) e)
     <> (select count(distinct e->>'player_id') from jsonb_array_elements(p_players) e) then
    raise exception 'A player cannot appear twice in the lineup.';
  end if;
  if (select count(*) from jsonb_array_elements(p_players) e)
     <> (select count(distinct (e->>'role') || ':' || (e->>'slot'))
         from jsonb_array_elements(p_players) e) then
    raise exception 'Each lineup role and slot can only be used once.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_players) e
    where not exists (
      select 1 from public.league_team_members m
      where m.team_id = v_team_id
        and m.player_id = (e->>'player_id')::uuid
        and m.status = 'ACTIVE'
    )
  ) then
    raise exception 'Every lineup player must be an ACTIVE squad member.';
  end if;

  select * into v_lineup
  from public.league_lineups l
  where l.fixture_id = p_fixture_id and l.team_id = v_team_id
  for update;

  if v_lineup.id is null then
    insert into public.league_lineups
      (fixture_id, team_id, submitted_by, version, status)
    values
      (p_fixture_id, v_team_id, v_me, 1, 'DRAFT')
    returning * into v_lineup;
  elsif v_lineup.status in ('REVEALED','LOCKED') then
    raise exception 'This lineup is locked and can no longer be changed.';
  else
    update public.league_lineups
      set status = 'DRAFT'
    where id = v_lineup.id;
    delete from public.league_lineup_players where lineup_id = v_lineup.id;
  end if;

  insert into public.league_lineup_players (lineup_id, player_id, role, slot)
  select v_lineup.id, (e->>'player_id')::uuid, e->>'role', (e->>'slot')::int
  from jsonb_array_elements(p_players) e;

  update public.league_lineups
    set status = 'SUBMITTED',
        submitted_by = v_me,
        submitted_at = now(),
        version = version + 1
  where id = v_lineup.id;

  perform public.league_maybe_reveal_fixture(p_fixture_id);

  perform public.league_notify_team(
    (case when v_fixture.home_team_id = v_team_id
      then v_fixture.away_team_id else v_fixture.home_team_id end),
    'LEAGUE_LINEUP_SUBMITTED',
    'League lineup submitted',
    'Your opponent has submitted their lineup.',
    'league_fixture', p_fixture_id);

  perform public.league_audit(
    v_season_id, 'LINEUP_SUBMITTED', 'league_fixture', p_fixture_id,
    null, jsonb_build_object('team_id', v_team_id, 'players', jsonb_array_length(p_players)),
    null);
end;
$$;

create or replace function public.league_start_duel(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_fixture_id uuid;
  v_opponent uuid;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
begin
  select f.season_id, d.fixture_id into v_season_id, v_fixture_id
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where d.id = p_duel_id;
  if v_season_id is null then
    raise exception 'League duel not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(p_duel_id);

  if v_season.status <> 'ACTIVE' then
    raise exception 'Duels can only be played in an active season.';
  end if;
  if v_fixture.status not in ('LINEUPS_REVEALED','IN_PROGRESS') then
    raise exception 'This fixture is not ready for duels.';
  end if;
  if v_me = v_duel.home_player_id then
    v_opponent := v_duel.away_player_id;
    if not public.league_is_team_member(v_duel.home_team_id, v_me) then
      raise exception 'You are no longer an active member of this squad.';
    end if;
  elsif v_me = v_duel.away_player_id then
    v_opponent := v_duel.home_player_id;
    if not public.league_is_team_member(v_duel.away_team_id, v_me) then
      raise exception 'You are no longer an active member of this squad.';
    end if;
  else
    raise exception 'Only the assigned duel players can start this duel.';
  end if;
  if v_duel.status = 'STARTED' then
    return;
  end if;
  if v_duel.status <> 'SCHEDULED' then
    raise exception 'This duel can no longer be started.';
  end if;
  if now() > v_duel.deadline then
    raise exception 'The duel deadline has passed.';
  end if;

  update public.league_duels
    set status = 'STARTED', started_at = now()
  where id = p_duel_id;
  update public.league_fixtures
    set status = 'IN_PROGRESS'
  where id = v_fixture.id and status = 'LINEUPS_REVEALED';

  perform public.league_notify(
    v_opponent, 'LEAGUE_DUEL_STARTED',
    'League duel started',
    'Your opponent started your 4vs4 duel.',
    'league_duel', p_duel_id);

  perform public.league_audit(
    v_season_id, 'DUEL_STARTED', 'league_duel', p_duel_id, null, null, null);
end;
$$;

create or replace function public.league_substitute_player(
  p_duel_id uuid,
  p_out_player_id uuid,
  p_in_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_fixture_id uuid;
  v_team_id uuid;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
begin
  select f.season_id, d.fixture_id into v_season_id, v_fixture_id
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where d.id = p_duel_id;
  if v_season_id is null then
    raise exception 'League duel not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(p_duel_id);

  if v_season.status <> 'ACTIVE' then
    raise exception 'Substitutions are only available in an active season.';
  end if;
  if v_fixture.status not in ('LINEUPS_REVEALED','IN_PROGRESS') then
    raise exception 'This fixture is not accepting substitutions.';
  end if;
  if v_duel.status <> 'SCHEDULED' then
    raise exception 'This duel can no longer be substituted.';
  end if;
  if now() > v_duel.deadline then
    raise exception 'The duel deadline has passed.';
  end if;
  if p_out_player_id = p_in_player_id then
    raise exception 'Choose a different substitute.';
  end if;

  if v_duel.home_player_id = p_out_player_id then
    v_team_id := v_duel.home_team_id;
  elsif v_duel.away_player_id = p_out_player_id then
    v_team_id := v_duel.away_team_id;
  else
    raise exception 'The outgoing player is not assigned to this duel.';
  end if;

  if not exists (
    select 1 from public.league_teams t
    where t.id = v_team_id and t.captain_id = v_me and t.status = 'APPROVED'
  ) then
    raise exception 'Only the affected squad captain can request a substitution.';
  end if;
  if v_duel.started_at is not null then
    raise exception 'Substitutions are locked after the duel starts.';
  end if;
  if exists (select 1 from public.league_duel_reports r where r.duel_id = p_duel_id) then
    raise exception 'Substitutions are locked after a result is reported.';
  end if;
  if exists (
    select 1 from public.league_duels d
    where d.fixture_id = v_duel.fixture_id
      and (d.home_player_id = p_in_player_id or d.away_player_id = p_in_player_id)
  ) then
    raise exception 'That substitute is already assigned to a duel this fixture.';
  end if;
  if not exists (
    select 1 from public.league_team_members m
    where m.team_id = v_team_id and m.player_id = p_in_player_id
      and m.status = 'ACTIVE'
  ) then
    raise exception 'The substitute must be an ACTIVE squad member.';
  end if;
  if not exists (
    select 1
    from public.league_lineup_players lp
    join public.league_lineups l on l.id = lp.lineup_id
    where l.fixture_id = v_duel.fixture_id and l.team_id = v_team_id
      and lp.player_id = p_in_player_id and lp.role = 'SUB'
  ) then
    raise exception 'The substitute must be on the bench for this fixture.';
  end if;

  insert into public.league_substitutions
    (duel_id, fixture_id, team_id, out_player_id, in_player_id, requested_by)
  values
    (p_duel_id, v_duel.fixture_id, v_team_id, p_out_player_id, p_in_player_id, v_me);

  if v_team_id = v_duel.home_team_id then
    update public.league_duels set home_player_id = p_in_player_id where id = p_duel_id;
  else
    update public.league_duels set away_player_id = p_in_player_id where id = p_duel_id;
  end if;

  perform public.league_notify(
    p_out_player_id, 'LEAGUE_SUBSTITUTION',
    'League substitution',
    'You were substituted out of your 4vs4 duel.',
    'league_duel', p_duel_id);
  perform public.league_notify(
    p_in_player_id, 'LEAGUE_SUBSTITUTION',
    'League substitution',
    'You were substituted into a 4vs4 duel.',
    'league_duel', p_duel_id);

  perform public.league_audit(
    v_season_id, 'SUBSTITUTION', 'league_duel', p_duel_id,
    jsonb_build_object('out_player_id', p_out_player_id),
    jsonb_build_object('in_player_id', p_in_player_id), null);
end;
$$;

create or replace function public.league_submit_duel_result(
  p_duel_id uuid,
  p_score_for int,
  p_score_against int,
  p_decided_by text,
  p_evidence_path text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_fixture_id uuid;
  v_side text;
  v_team_id uuid;
  v_opponent_player uuid;
  v_home_score int;
  v_away_score int;
  v_winner uuid;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
  v_report public.league_duel_reports%rowtype;
  v_opponent_report public.league_duel_reports%rowtype;
begin
  select f.season_id, d.fixture_id into v_season_id, v_fixture_id
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where d.id = p_duel_id;
  if v_season_id is null then
    raise exception 'League duel not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(p_duel_id);

  if v_season.status <> 'ACTIVE' then
    raise exception 'Results can only be reported in an active season.';
  end if;
  if v_fixture.status not in ('LINEUPS_REVEALED','IN_PROGRESS') then
    raise exception 'This fixture is not accepting results.';
  end if;
  if v_duel.status not in ('STARTED','AWAITING_RESULTS') then
    raise exception 'This duel is not accepting results (status %).', v_duel.status;
  end if;
  if p_score_for is null or p_score_for not between 0 and 99
     or p_score_against is null or p_score_against not between 0 and 99 then
    raise exception 'Scores must be between 0 and 99.';
  end if;
  if p_score_for = p_score_against then
    raise exception 'Duel scores must be decisive.';
  end if;
  if p_decided_by is null or upper(p_decided_by) not in ('REGULATION','EXTRA_TIME','PENALTIES') then
    raise exception 'Decided by must be REGULATION, EXTRA_TIME or PENALTIES.';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Result note is too long.';
  end if;
  perform public.league_validate_evidence(p_duel_id, v_me, p_evidence_path);

  if v_duel.home_player_id = v_me then
    v_side := 'HOME';
    v_team_id := v_duel.home_team_id;
    v_opponent_player := v_duel.away_player_id;
  elsif v_duel.away_player_id = v_me then
    v_side := 'AWAY';
    v_team_id := v_duel.away_team_id;
    v_opponent_player := v_duel.home_player_id;
  else
    raise exception 'Only the assigned duel players can report a result.';
  end if;
  if not public.league_is_team_member(v_team_id, v_me) then
    raise exception 'You are no longer an active member of this squad.';
  end if;

  select * into v_report
  from public.league_duel_reports r
  where r.duel_id = p_duel_id and r.player_id = v_me
  for update;

  if v_report.id is not null and v_report.status in ('CONFIRMED','REJECTED') then
    raise exception 'This result can no longer be changed.';
  end if;

  if v_report.id is null then
    insert into public.league_duel_reports
      (duel_id, player_id, team_id, side, score_for, score_against,
       decided_by, evidence_path, note, status, submitted_at)
    values
      (p_duel_id, v_me, v_team_id, v_side, p_score_for, p_score_against,
       upper(p_decided_by), p_evidence_path, nullif(btrim(p_note), ''), 'SUBMITTED', now())
    returning * into v_report;
  else
    update public.league_duel_reports
      set side = v_side,
          team_id = v_team_id,
          score_for = p_score_for,
          score_against = p_score_against,
          decided_by = upper(p_decided_by),
          evidence_path = p_evidence_path,
          note = nullif(btrim(p_note), ''),
          status = 'SUBMITTED',
          submitted_at = now()
    where id = v_report.id
    returning * into v_report;
  end if;

  select * into v_opponent_report
  from public.league_duel_reports r
  where r.duel_id = p_duel_id and r.player_id = v_opponent_player
  for update;

  if v_opponent_report.id is not null and v_opponent_report.status = 'SUBMITTED' then
    if v_opponent_report.score_for = v_report.score_against
       and v_opponent_report.score_against = v_report.score_for
       and v_opponent_report.decided_by = v_report.decided_by then
      update public.league_duel_reports
        set status = 'CONFIRMED'
      where duel_id = p_duel_id and player_id in (v_me, v_opponent_player);
      update public.league_duels
        set home_score = case when v_side = 'HOME' then p_score_for else p_score_against end,
            away_score = case when v_side = 'HOME' then p_score_against else p_score_for end,
            winner_team_id = case
              when v_side = 'HOME' and p_score_for > p_score_against then v_duel.home_team_id
              when v_side = 'AWAY' and p_score_for > p_score_against then v_duel.away_team_id
              when v_side = 'HOME' then v_duel.away_team_id
              else v_duel.home_team_id end,
            status = 'CONFIRMED',
            confirmed_at = now()
      where id = p_duel_id;

      update public.league_fixtures
        set home_duel_wins = home_duel_wins + case
              when (v_side = 'HOME' and p_score_for > p_score_against)
                or (v_side = 'AWAY' and p_score_against > p_score_for) then 1 else 0 end,
            away_duel_wins = away_duel_wins + case
              when (v_side = 'AWAY' and p_score_for > p_score_against)
                or (v_side = 'HOME' and p_score_against > p_score_for) then 1 else 0 end
      where id = v_fixture.id;

      perform public.league_finalize_fixture(v_fixture.id);

      perform public.league_notify(
        v_opponent_player, 'LEAGUE_DUEL_CONFIRMED',
        'League duel confirmed',
        'Your 4vs4 duel result was confirmed.',
        'league_duel', p_duel_id);
      perform public.league_audit(
        v_season_id, 'DUEL_CONFIRMED', 'league_duel', p_duel_id,
        null, jsonb_build_object('score_for', p_score_for, 'score_against', p_score_against),
        null);
      return;
    end if;

    update public.league_duel_reports
      set status = 'DISPUTED'
    where duel_id = p_duel_id and player_id in (v_me, v_opponent_player);
    update public.league_duels set status = 'DISPUTED' where id = p_duel_id;

    if not exists (
      select 1 from public.league_disputes x
      where x.duel_id = p_duel_id and x.status in ('OPEN','UNDER_REVIEW')
    ) then
      insert into public.league_disputes
        (duel_id, opened_by, reason, evidence_path, status)
      values
        (p_duel_id, v_me, 'League duel result mismatch.',
         p_evidence_path, 'OPEN');
    end if;

    perform public.league_notify(
      v_opponent_player, 'LEAGUE_DUEL_DISPUTED',
      'League duel disputed',
      'Your 4vs4 duel result did not match. Staff will review it.',
      'league_duel', p_duel_id);
    perform public.league_notify_staff(
      'LEAGUE_DUEL_DISPUTED',
      'League duel needs review',
      'A 4vs4 duel result mismatch is waiting for staff review.',
      'league_duel', p_duel_id);
    perform public.league_audit(
      v_season_id, 'DUEL_DISPUTED', 'league_duel', p_duel_id,
      null, jsonb_build_object('score_for', p_score_for, 'score_against', p_score_against),
      'Result mismatch');
    return;
  end if;

  update public.league_duels set status = 'AWAITING_RESULTS' where id = p_duel_id;

  perform public.league_notify(
    v_opponent_player, 'LEAGUE_DUEL_RESULT',
    'League duel result waiting',
    'Your opponent submitted a 4vs4 result. Submit yours or confirm theirs.',
    'league_duel', p_duel_id);
  perform public.league_audit(
    v_season_id, 'DUEL_RESULT_SUBMITTED', 'league_duel', p_duel_id,
    null, jsonb_build_object('score_for', p_score_for, 'score_against', p_score_against),
    null);
end;
$$;

create or replace function public.league_confirm_duel_result(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_fixture_id uuid;
  v_team_id uuid;
  v_winner uuid;
  v_home_score int;
  v_away_score int;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
  v_opponent_report public.league_duel_reports%rowtype;
begin
  select f.season_id, d.fixture_id into v_season_id, v_fixture_id
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where d.id = p_duel_id;
  if v_season_id is null then
    raise exception 'League duel not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(p_duel_id);

  if v_season.status <> 'ACTIVE' then
    raise exception 'Results can only be confirmed in an active season.';
  end if;
  if v_fixture.status not in ('LINEUPS_REVEALED','IN_PROGRESS') then
    raise exception 'This fixture is no longer accepting confirmations.';
  end if;
  if v_duel.status <> 'AWAITING_RESULTS' then
    raise exception 'This duel has no result waiting for confirmation.';
  end if;
  if v_duel.home_player_id = v_me then
    v_team_id := v_duel.home_team_id;
  elsif v_duel.away_player_id = v_me then
    v_team_id := v_duel.away_team_id;
  else
    raise exception 'Only the assigned duel players can confirm a result.';
  end if;
  if not public.league_is_team_member(v_team_id, v_me) then
    raise exception 'You are no longer an active member of this squad.';
  end if;
  if exists (
    select 1 from public.league_duel_reports r
    where r.duel_id = p_duel_id and r.player_id = v_me
      and r.status in ('SUBMITTED','DISPUTED')
  ) then
    raise exception 'Your own reported result must be resolved by staff.';
  end if;
  if exists (
    select 1 from public.league_disputes x
    where x.duel_id = p_duel_id and x.status in ('OPEN','UNDER_REVIEW')
  ) then
    raise exception 'This duel is under dispute review.';
  end if;

  select * into v_opponent_report
  from public.league_duel_reports r
  where r.duel_id = p_duel_id and r.player_id <> v_me
    and r.status = 'SUBMITTED'
  for update;
  if v_opponent_report.id is null then
    raise exception 'There is no result waiting for confirmation.';
  end if;

  if v_opponent_report.side = 'HOME' then
    v_home_score := v_opponent_report.score_for;
    v_away_score := v_opponent_report.score_against;
    v_winner := case when v_home_score > v_away_score
      then v_duel.home_team_id else v_duel.away_team_id end;
  else
    v_home_score := v_opponent_report.score_against;
    v_away_score := v_opponent_report.score_for;
    v_winner := case when v_away_score > v_home_score
      then v_duel.away_team_id else v_duel.home_team_id end;
  end if;

  update public.league_duel_reports
    set status = 'CONFIRMED'
  where id = v_opponent_report.id;
  update public.league_duels
    set status = 'CONFIRMED',
        home_score = v_home_score,
        away_score = v_away_score,
        winner_team_id = v_winner,
        confirmed_at = now()
  where id = p_duel_id;

  update public.league_fixtures
    set home_duel_wins = home_duel_wins + case when v_winner = v_duel.home_team_id then 1 else 0 end,
        away_duel_wins = away_duel_wins + case when v_winner = v_duel.away_team_id then 1 else 0 end
  where id = v_fixture.id;

  perform public.league_finalize_fixture(v_fixture.id);

  perform public.league_notify(
    v_opponent_report.player_id, 'LEAGUE_DUEL_CONFIRMED',
    'League duel confirmed',
    'Your 4vs4 duel result was confirmed.',
    'league_duel', p_duel_id);
  perform public.league_audit(
    v_season_id, 'DUEL_CONFIRMED_BY_OPPONENT', 'league_duel', p_duel_id,
    null, jsonb_build_object('home_score', v_home_score, 'away_score', v_away_score),
    null);
end;
$$;

create or replace function public.league_dispute_duel(
  p_duel_id uuid,
  p_reason text,
  p_evidence_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_active();
  v_season_id uuid;
  v_fixture_id uuid;
  v_opponent uuid;
  v_captain_team uuid;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
  v_id uuid;
begin
  select f.season_id, d.fixture_id into v_season_id, v_fixture_id
  from public.league_duels d
  join public.league_fixtures f on f.id = d.fixture_id
  where d.id = p_duel_id;
  if v_season_id is null then
    raise exception 'League duel not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(p_duel_id);

  if v_season.status <> 'ACTIVE' then
    raise exception 'Disputes can only be opened in an active season.';
  end if;
  if v_fixture.status not in ('LINEUPS_REVEALED','IN_PROGRESS') then
    raise exception 'This fixture is no longer accepting disputes.';
  end if;
  if v_duel.status not in ('STARTED','AWAITING_RESULTS') then
    raise exception 'This duel cannot be disputed (status %).', v_duel.status;
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;
  if p_evidence_path is not null then
    perform public.league_validate_evidence(p_duel_id, v_me, p_evidence_path);
  end if;

  if v_duel.home_player_id = v_me then
    v_opponent := v_duel.away_player_id;
  elsif v_duel.away_player_id = v_me then
    v_opponent := v_duel.home_player_id;
  else
    select t.id into v_captain_team
    from public.league_teams t
    where t.id in (v_duel.home_team_id, v_duel.away_team_id)
      and t.captain_id = v_me and t.status = 'APPROVED';

    if v_captain_team is null then
      raise exception 'Only a duel participant or their captain can open a dispute.';
    end if;
    v_opponent := case when v_captain_team = v_duel.home_team_id
      then v_duel.away_player_id else v_duel.home_player_id end;
  end if;

  if exists (
    select 1 from public.league_disputes x
    where x.duel_id = p_duel_id and x.status in ('OPEN','UNDER_REVIEW')
  ) then
    raise exception 'This duel already has an open dispute.';
  end if;

  insert into public.league_disputes
    (duel_id, opened_by, reason, evidence_path, status)
  values
    (p_duel_id, v_me, btrim(p_reason), p_evidence_path, 'OPEN')
  returning id into v_id;

  update public.league_duels set status = 'DISPUTED' where id = p_duel_id;
  update public.league_duel_reports
    set status = 'DISPUTED'
  where duel_id = p_duel_id and status = 'SUBMITTED';

  perform public.league_notify(
    v_opponent, 'LEAGUE_DUEL_DISPUTED',
    'League duel disputed',
    'Your 4vs4 duel was disputed. Staff will review it.',
    'league_duel', p_duel_id);
  perform public.league_notify_staff(
    'LEAGUE_DUEL_DISPUTED',
    'League duel needs review',
    'A 4vs4 duel dispute is waiting for staff review.',
    'league_duel', p_duel_id);
  perform public.league_audit(
    v_season_id, 'DUEL_DISPUTE_OPENED', 'league_duel', p_duel_id,
    null, jsonb_build_object('dispute_id', v_id), btrim(p_reason));

  return v_id;
end;
$$;

create or replace function public.league_resolve_dispute(
  p_dispute_id uuid,
  p_winner_team_id uuid,
  p_home_score int,
  p_away_score int,
  p_resolution text,
  p_forfeit boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.league_require_dispute_staff();
  v_dispute public.league_disputes%rowtype;
  v_season public.league_seasons%rowtype;
  v_fixture public.league_fixtures%rowtype;
  v_duel public.league_duels%rowtype;
  v_season_id uuid;
  v_fixture_id uuid;
  v_duel_id uuid;
  v_expected uuid;
begin
  select x.duel_id, f.season_id, d.fixture_id
    into v_duel_id, v_season_id, v_fixture_id
  from public.league_disputes x
  join public.league_duels d on d.id = x.duel_id
  join public.league_fixtures f on f.id = d.fixture_id
  where x.id = p_dispute_id;
  if v_duel_id is null then
    raise exception 'League dispute not found.';
  end if;

  v_season := public.league_lock_season(v_season_id);
  v_fixture := public.league_lock_fixture(v_fixture_id);
  v_duel := public.league_lock_duel(v_duel_id);
  select * into v_dispute
  from public.league_disputes x
  where x.id = p_dispute_id
  for update;

  if v_season.status <> 'ACTIVE' then
    raise exception 'Disputes can only be resolved in an active season.';
  end if;
  if v_dispute.status not in ('OPEN','UNDER_REVIEW') then
    raise exception 'This dispute is already closed.';
  end if;
  if v_duel.status not in ('DISPUTED','AWAITING_RESULTS') then
    raise exception 'This duel is not waiting for dispute resolution.';
  end if;
  if p_resolution is null or char_length(btrim(p_resolution)) not between 3 and 1000 then
    raise exception 'Give a resolution between 3 and 1000 characters.';
  end if;
  if p_winner_team_id is null
     or p_winner_team_id not in (v_duel.home_team_id, v_duel.away_team_id) then
    raise exception 'The winning team must be part of this duel.';
  end if;

  if not coalesce(p_forfeit, false) then
    if p_home_score is null or p_home_score not between 0 and 99
       or p_away_score is null or p_away_score not between 0 and 99 then
      raise exception 'Scores must be between 0 and 99.';
    end if;
    if p_home_score = p_away_score then
      raise exception 'Duel scores must be decisive.';
    end if;
    v_expected := case when p_home_score > p_away_score
      then v_duel.home_team_id else v_duel.away_team_id end;
    if p_winner_team_id <> v_expected then
      raise exception 'The winner does not match the reported score.';
    end if;
  end if;

  if coalesce(p_forfeit, false) then
    update public.league_duel_reports
      set status = 'REJECTED'
    where duel_id = v_duel_id and status in ('SUBMITTED','DISPUTED');

    update public.league_duels
      set status = 'FORFEITED',
          home_score = null,
          away_score = null,
          winner_team_id = p_winner_team_id,
          confirmed_at = now(),
          resolved_by = v_me,
          resolution_note = btrim(p_resolution)
    where id = v_duel_id;
  else
    update public.league_duel_reports
      set status = case
        when (side = 'HOME' and score_for = p_home_score and score_against = p_away_score)
          or (side = 'AWAY' and score_for = p_away_score and score_against = p_home_score)
        then 'CONFIRMED' else 'REJECTED' end
    where duel_id = v_duel_id and status in ('SUBMITTED','DISPUTED');

    update public.league_duels
      set status = 'CONFIRMED',
          home_score = p_home_score,
          away_score = p_away_score,
          winner_team_id = p_winner_team_id,
          confirmed_at = now(),
          resolved_by = v_me,
          resolution_note = btrim(p_resolution)
    where id = v_duel_id;
  end if;

  update public.league_fixtures
    set home_duel_wins = home_duel_wins + case when p_winner_team_id = v_duel.home_team_id then 1 else 0 end,
        away_duel_wins = away_duel_wins + case when p_winner_team_id = v_duel.away_team_id then 1 else 0 end
  where id = v_duel.fixture_id;

  perform public.league_finalize_fixture(v_duel.fixture_id);

  update public.league_disputes
    set status = 'RESOLVED',
        resolution = btrim(p_resolution),
        resolved_by = v_me,
        resolved_at = now()
  where duel_id = v_duel_id and status in ('OPEN','UNDER_REVIEW');

  perform public.league_notify_team(
    v_duel.home_team_id, 'LEAGUE_DUEL_RESOLVED',
    'League dispute resolved',
    'Staff resolved a 4vs4 duel dispute.',
    'league_duel', v_duel_id);
  perform public.league_notify_team(
    v_duel.away_team_id, 'LEAGUE_DUEL_RESOLVED',
    'League dispute resolved',
    'Staff resolved a 4vs4 duel dispute.',
    'league_duel', v_duel_id);

  perform public.league_audit(
    v_season_id, 'DISPUTE_RESOLVED', 'league_duel', v_duel_id,
    jsonb_build_object('status', v_duel.status),
    jsonb_build_object(
      'status', case when coalesce(p_forfeit, false) then 'FORFEITED' else 'CONFIRMED' end,
      'winner_team_id', p_winner_team_id,
      'home_score', p_home_score, 'away_score', p_away_score),
    btrim(p_resolution));
end;
$$;

-- ============================================================================
-- 8. Read models: standings, player stats and team stats
-- ============================================================================

create or replace function public.league_standings(p_season_id uuid)
returns table (
  standing_position int,
  team_id uuid,
  team_name text,
  played int,
  wins int,
  draws int,
  losses int,
  duels_won int,
  duels_lost int,
  duel_diff int,
  fixture_points int,
  penalty_points int,
  points int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.league_require_active();

  return query
  with team_fixtures as (
    select
      t.id as tf_team_id,
      count(f.id) filter (where f.status in ('COMPLETED','FORFEITED'))::int as tf_played,
      count(f.id) filter (
        where f.status in ('COMPLETED','FORFEITED')
          and ((f.home_team_id = t.id and f.home_points = 3)
            or (f.away_team_id = t.id and f.away_points = 3))
      )::int as tf_wins,
      count(f.id) filter (
        where f.status in ('COMPLETED','FORFEITED')
          and ((f.home_team_id = t.id and f.home_points = 1)
            or (f.away_team_id = t.id and f.away_points = 1))
      )::int as tf_draws,
      count(f.id) filter (
        where f.status in ('COMPLETED','FORFEITED')
          and ((f.home_team_id = t.id and f.home_points = 0)
            or (f.away_team_id = t.id and f.away_points = 0))
      )::int as tf_losses,
      coalesce(sum(
        case when f.home_team_id = t.id then f.home_duel_wins else f.away_duel_wins end
      ) filter (where f.status in ('COMPLETED','FORFEITED')), 0)::int as tf_duels_won,
      coalesce(sum(
        case when f.home_team_id = t.id then f.home_points else f.away_points end
      ) filter (where f.status in ('COMPLETED','FORFEITED')), 0)::int as tf_points
    from public.league_teams t
    left join public.league_fixtures f
      on f.season_id = t.season_id
     and (f.home_team_id = t.id or f.away_team_id = t.id)
    where t.season_id = p_season_id and t.status = 'APPROVED'
    group by t.id
  ),
  penalty_totals as (
    select p.team_id, sum(p.points)::int as penalty_points
    from public.league_penalties p
    where p.season_id = p_season_id
    group by p.team_id
  ),
  base as (
    select
      tf.tf_team_id as b_team_id,
      t.name as b_name,
      tf.tf_played as b_played,
      tf.tf_wins as b_wins,
      tf.tf_draws as b_draws,
      tf.tf_losses as b_losses,
      tf.tf_duels_won as b_duels_won,
      (4 * tf.tf_played - tf.tf_duels_won)::int as b_duels_lost,
      (2 * tf.tf_duels_won - 4 * tf.tf_played)::int as b_duel_diff,
      tf.tf_points as b_fixture_points,
      coalesce(pt.penalty_points, 0)::int as b_penalty_points,
      (tf.tf_points + coalesce(pt.penalty_points, 0))::int as b_points
    from team_fixtures tf
    join public.league_teams t on t.id = tf.tf_team_id
    left join penalty_totals pt on pt.team_id = tf.tf_team_id
  ),
  with_h2h as (
    select
      b.*,
      coalesce((
        select sum(
          case when f.home_team_id = b.b_team_id then f.home_points else f.away_points end
        )::int
        from public.league_fixtures f
        join base b2
          on b2.b_team_id = case when f.home_team_id = b.b_team_id
            then f.away_team_id else f.home_team_id end
        where f.season_id = p_season_id
          and f.status in ('COMPLETED','FORFEITED')
          and (f.home_team_id = b.b_team_id or f.away_team_id = b.b_team_id)
          and b2.b_points = b.b_points
          and b2.b_duel_diff = b.b_duel_diff
          and b2.b_duels_won = b.b_duels_won
      ), 0)::int as b_h2h_points
    from base b
  )
  select
    row_number() over (
      order by
        h.b_points desc,
        h.b_duel_diff desc,
        h.b_duels_won desc,
        h.b_h2h_points desc,
        coalesce(tb.position, 2147483647),
        h.b_name asc,
        h.b_team_id
    )::int as standing_position,
    h.b_team_id,
    h.b_name,
    h.b_played,
    h.b_wins,
    h.b_draws,
    h.b_losses,
    h.b_duels_won,
    h.b_duels_lost,
    h.b_duel_diff,
    h.b_fixture_points,
    h.b_penalty_points,
    h.b_points
  from with_h2h h
  left join public.league_tiebreak_orders tb
    on tb.season_id = p_season_id and tb.team_id = h.b_team_id;
end;
$$;

create or replace function public.league_player_stats(p_season_id uuid)
returns table (
  player_id uuid,
  player_name text,
  team_id uuid,
  team_name text,
  duels_played int,
  duels_won int,
  duels_lost int,
  goals_for int,
  goals_against int,
  goal_diff int,
  win_rate numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.league_require_active();

  return query
  with final_duels as (
    select d.*
    from public.league_duels d
    join public.league_fixtures f on f.id = d.fixture_id
    where f.season_id = p_season_id
      and d.status in ('CONFIRMED','FORFEITED')
  ),
  stat_rows as (
    select
      d.home_player_id as sr_player_id,
      d.home_team_id as sr_team_id,
      case when d.winner_team_id = d.home_team_id then 1 else 0 end as sr_won,
      coalesce(d.home_score, 0) as sr_goals_for,
      coalesce(d.away_score, 0) as sr_goals_against
    from final_duels d
    union all
    select
      d.away_player_id,
      d.away_team_id,
      case when d.winner_team_id = d.away_team_id then 1 else 0 end,
      coalesce(d.away_score, 0),
      coalesce(d.home_score, 0)
    from final_duels d
  )
  select
    s.sr_player_id,
    coalesce(nullif(p.display_name, ''), p.username, '?'),
    s.sr_team_id,
    t.name,
    count(*)::int,
    sum(s.sr_won)::int,
    (count(*) - sum(s.sr_won))::int,
    sum(s.sr_goals_for)::int,
    sum(s.sr_goals_against)::int,
    (sum(s.sr_goals_for) - sum(s.sr_goals_against))::int,
    round(100.0 * sum(s.sr_won) / nullif(count(*), 0), 1)
  from stat_rows s
  join public.profiles p on p.id = s.sr_player_id
  join public.league_teams t on t.id = s.sr_team_id
  group by s.sr_player_id, p.display_name, p.username, s.sr_team_id, t.name
  order by 11 desc nulls last, 10 desc, 2 asc;
end;
$$;

create or replace function public.league_team_stats(p_season_id uuid)
returns table (
  team_id uuid,
  team_name text,
  played int,
  wins int,
  draws int,
  losses int,
  duels_won int,
  duels_lost int,
  duel_diff int,
  goals_for int,
  goals_against int,
  points int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.league_require_active();

  return query
  with final_duels as (
    select d.*
    from public.league_duels d
    join public.league_fixtures f on f.id = d.fixture_id
    where f.season_id = p_season_id
      and d.status in ('CONFIRMED','FORFEITED')
  ),
  goals as (
    select g.ts_team_id, sum(g.ts_for)::int as goals_for, sum(g.ts_against)::int as goals_against
    from (
      select d.home_team_id as ts_team_id, coalesce(d.home_score, 0) as ts_for,
             coalesce(d.away_score, 0) as ts_against
      from final_duels d
      union all
      select d.away_team_id, coalesce(d.away_score, 0), coalesce(d.home_score, 0)
      from final_duels d
    ) g
    group by g.ts_team_id
  )
  select
    t.id,
    t.name,
    count(f.id) filter (where f.status in ('COMPLETED','FORFEITED'))::int as played,
    count(f.id) filter (
      where f.status in ('COMPLETED','FORFEITED')
        and ((f.home_team_id = t.id and f.home_points = 3)
          or (f.away_team_id = t.id and f.away_points = 3))
    )::int as wins,
    count(f.id) filter (
      where f.status in ('COMPLETED','FORFEITED')
        and ((f.home_team_id = t.id and f.home_points = 1)
          or (f.away_team_id = t.id and f.away_points = 1))
    )::int as draws,
    count(f.id) filter (
      where f.status in ('COMPLETED','FORFEITED')
        and ((f.home_team_id = t.id and f.home_points = 0)
          or (f.away_team_id = t.id and f.away_points = 0))
    )::int as losses,
    coalesce(sum(
      case when f.home_team_id = t.id then f.home_duel_wins else f.away_duel_wins end
    ) filter (where f.status in ('COMPLETED','FORFEITED')), 0)::int as duels_won,
    (4 * count(f.id) filter (where f.status in ('COMPLETED','FORFEITED'))
      - coalesce(sum(
          case when f.home_team_id = t.id then f.home_duel_wins else f.away_duel_wins end
        ) filter (where f.status in ('COMPLETED','FORFEITED')), 0))::int as duels_lost,
    (2 * coalesce(sum(
        case when f.home_team_id = t.id then f.home_duel_wins else f.away_duel_wins end
      ) filter (where f.status in ('COMPLETED','FORFEITED')), 0)
      - 4 * count(f.id) filter (where f.status in ('COMPLETED','FORFEITED')))::int as duel_diff,
    coalesce(g.goals_for, 0),
    coalesce(g.goals_against, 0),
    (coalesce(sum(
      case when f.home_team_id = t.id then f.home_points else f.away_points end
    ) filter (where f.status in ('COMPLETED','FORFEITED')), 0)
      + coalesce((
        select sum(p.points)::int from public.league_penalties p
        where p.season_id = p_season_id and p.team_id = t.id
      ), 0))::int
  from public.league_teams t
  left join public.league_fixtures f
    on f.season_id = t.season_id
   and (f.home_team_id = t.id or f.away_team_id = t.id)
  left join goals g on g.ts_team_id = t.id
  where t.season_id = p_season_id and t.status = 'APPROVED'
  group by t.id, t.name, g.goals_for, g.goals_against
  order by points desc, duel_diff desc, duels_won desc, t.name asc;
end;
$$;

-- ============================================================================
-- 9. Privileges
-- ============================================================================

revoke all on function public.league_require_active() from public, anon, authenticated;
revoke all on function public.league_require_admin() from public, anon, authenticated;
revoke all on function public.league_require_dispute_staff() from public, anon, authenticated;
revoke all on function public.league_require_captain(uuid) from public, anon, authenticated;
revoke all on function public.league_audit(uuid, text, text, uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.league_notify(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.league_notify_team(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.league_notify_staff(text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.league_notify_season(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.league_lock_season(uuid) from public, anon, authenticated;
revoke all on function public.league_lock_team(uuid) from public, anon, authenticated;
revoke all on function public.league_lock_matchday(uuid) from public, anon, authenticated;
revoke all on function public.league_lock_fixture(uuid) from public, anon, authenticated;
revoke all on function public.league_lock_duel(uuid) from public, anon, authenticated;
revoke all on function public.league_validate_evidence(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.league_maybe_reveal_fixture(uuid) from public, anon, authenticated;
revoke all on function public.league_finalize_fixture(uuid) from public, anon, authenticated;

revoke all on function public.league_create_season(text, text, timestamptz, timestamptz, timestamptz, int, int, int, int, int) from public, anon, authenticated;
revoke all on function public.league_update_season(uuid, text, text, timestamptz, timestamptz, timestamptz, int, int, int, int, int) from public, anon, authenticated;
revoke all on function public.league_set_season_status(uuid, text, text) from public, anon, authenticated;
revoke all on function public.league_generate_fixtures(uuid, boolean) from public, anon, authenticated;
revoke all on function public.league_extend_matchday(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.league_approve_team(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.league_replace_member(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.league_apply_penalty(uuid, uuid, int, text, uuid) from public, anon, authenticated;
revoke all on function public.league_set_tiebreak_order(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.league_create_team(uuid, text) from public, anon, authenticated;
revoke all on function public.league_update_team(uuid, text) from public, anon, authenticated;
revoke all on function public.league_invite_member(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.league_answer_invite(uuid, boolean) from public, anon, authenticated;
revoke all on function public.league_leave_team(uuid) from public, anon, authenticated;
revoke all on function public.league_remove_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.league_transfer_captain(uuid, uuid) from public, anon, authenticated;
revoke all on function public.league_submit_lineup(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.league_start_duel(uuid) from public, anon, authenticated;
revoke all on function public.league_substitute_player(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.league_submit_duel_result(uuid, int, int, text, text, text) from public, anon, authenticated;
revoke all on function public.league_confirm_duel_result(uuid) from public, anon, authenticated;
revoke all on function public.league_dispute_duel(uuid, text, text) from public, anon, authenticated;
revoke all on function public.league_resolve_dispute(uuid, uuid, int, int, text, boolean) from public, anon, authenticated;
revoke all on function public.league_standings(uuid) from public, anon, authenticated;
revoke all on function public.league_player_stats(uuid) from public, anon, authenticated;
revoke all on function public.league_team_stats(uuid) from public, anon, authenticated;

grant execute on function public.league_create_season(text, text, timestamptz, timestamptz, timestamptz, int, int, int, int, int) to authenticated;
grant execute on function public.league_update_season(uuid, text, text, timestamptz, timestamptz, timestamptz, int, int, int, int, int) to authenticated;
grant execute on function public.league_set_season_status(uuid, text, text) to authenticated;
grant execute on function public.league_generate_fixtures(uuid, boolean) to authenticated;
grant execute on function public.league_extend_matchday(uuid, timestamptz, text) to authenticated;
grant execute on function public.league_approve_team(uuid, boolean, text) to authenticated;
grant execute on function public.league_replace_member(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.league_apply_penalty(uuid, uuid, int, text, uuid) to authenticated;
grant execute on function public.league_set_tiebreak_order(uuid, uuid[], text) to authenticated;
grant execute on function public.league_create_team(uuid, text) to authenticated;
grant execute on function public.league_update_team(uuid, text) to authenticated;
grant execute on function public.league_invite_member(uuid, uuid, text) to authenticated;
grant execute on function public.league_answer_invite(uuid, boolean) to authenticated;
grant execute on function public.league_leave_team(uuid) to authenticated;
grant execute on function public.league_remove_member(uuid, uuid) to authenticated;
grant execute on function public.league_transfer_captain(uuid, uuid) to authenticated;
grant execute on function public.league_submit_lineup(uuid, jsonb) to authenticated;
grant execute on function public.league_start_duel(uuid) to authenticated;
grant execute on function public.league_substitute_player(uuid, uuid, uuid) to authenticated;
grant execute on function public.league_submit_duel_result(uuid, int, int, text, text, text) to authenticated;
grant execute on function public.league_confirm_duel_result(uuid) to authenticated;
grant execute on function public.league_dispute_duel(uuid, text, text) to authenticated;
grant execute on function public.league_resolve_dispute(uuid, uuid, int, int, text, boolean) to authenticated;
grant execute on function public.league_standings(uuid) to authenticated;
grant execute on function public.league_player_stats(uuid) to authenticated;
grant execute on function public.league_team_stats(uuid) to authenticated;
