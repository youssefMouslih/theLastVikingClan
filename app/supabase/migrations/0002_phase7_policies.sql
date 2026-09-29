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
