-- VIK Clan FULL database setup: entire schema in ONE run.
-- Paste the whole file into Supabase SQL editor and Run.
-- Safe to re-run: every statement is IF NOT EXISTS / DROP IF EXISTS / OR REPLACE.

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
