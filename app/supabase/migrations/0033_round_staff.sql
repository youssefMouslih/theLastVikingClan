-- VIK Clan migration 0033: round control for staff.
-- Run AFTER 0032. Moderators start league/cup rounds alongside owners and
-- admins (round gating: a round opens when the previous round finishes,
-- or when staff force-starts it early).

drop policy if exists "admins manage rounds" on public.rounds;
create policy "staff manage rounds"
  on public.rounds for all to authenticated
  using (public.is_clan_role(array['OWNER', 'ADMIN', 'MODERATOR']))
  with check (public.is_clan_role(array['OWNER', 'ADMIN', 'MODERATOR']));
