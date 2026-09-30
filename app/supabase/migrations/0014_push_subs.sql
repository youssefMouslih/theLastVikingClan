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
