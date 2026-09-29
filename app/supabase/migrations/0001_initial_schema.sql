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
-- insert into storage.buckets (id, name, public) values ('avatars','avatars',false), ('clan-assets','clan-assets',false), ('match-evidence','match-evidence',false)
-- on conflict do nothing;

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
create policy "authenticated read profiles" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid());
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

create policy "authenticated read clan" on public.clan_settings for select to authenticated using (true);
create policy "admins manage clan" on public.clan_settings for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

create policy "authenticated read competitions" on public.competitions for select to authenticated using (true);
create policy "admins manage competitions" on public.competitions for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN']));

create policy "authenticated read participants" on public.competition_participants for select to authenticated using (true);
create policy "admins manage participants" on public.competition_participants for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));

create policy "authenticated read matches" on public.matches for select to authenticated using (true);
create policy "players submit own matches" on public.matches for update to authenticated using (
  auth.uid() = player_a_id or auth.uid() = player_b_id or public.is_clan_role(array['OWNER','ADMIN','MODERATOR'])
);
create policy "admins manage matches" on public.matches for all to authenticated using (public.is_clan_role(array['OWNER','ADMIN','MODERATOR']));

create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
