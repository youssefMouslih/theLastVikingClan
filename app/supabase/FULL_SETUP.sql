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
