-- 0053_dispute_hardening.sql
-- 1v1 result disputes were opened by a client-side insert + match update.
-- That allowed stale clients to reopen CONFIRMED/FORFEIT matches and create
-- duplicate open disputes. This migration makes the write authoritative:
--   * one SECURITY DEFINER RPC validates the match state and the caller;
--   * direct player inserts are denied by RLS;
--   * only one OPEN/UNDER_REVIEW dispute can exist per match;
--   * players can read only disputes for their own matches (staff still read
--     the full queue).

-- Close legacy duplicate open disputes before adding the partial unique index.
update public.disputes d
set status = 'REJECTED',
    resolution = coalesce(d.resolution, 'Closed duplicate dispute during 0053 cleanup.'),
    resolved_at = coalesce(d.resolved_at, now())
where d.id in (
  select ranked.id
  from (
    select id,
           row_number() over (
             partition by match_id
             order by created_at desc, id desc
           ) as rn
    from public.disputes
    where status in ('OPEN', 'UNDER_REVIEW')
  ) ranked
  where ranked.rn > 1
);

create unique index if not exists disputes_one_open_per_match_idx
  on public.disputes (match_id)
  where status in ('OPEN', 'UNDER_REVIEW');

-- Players may only read disputes for matches they played. Staff keep full access.
drop policy if exists "authenticated read disputes" on public.disputes;
create policy "match players and staff read disputes" on public.disputes
  for select to authenticated
  using (
    public.is_clan_role(array['OWNER', 'ADMIN', 'MODERATOR'])
    or exists (
      select 1
      from public.matches m
      where m.id = match_id
        and (m.player_a_id = auth.uid() or m.player_b_id = auth.uid())
    )
  );

-- Direct player inserts are no longer allowed; use dispute_match().
drop policy if exists "members open disputes" on public.disputes;

create or replace function public.dispute_match(
  p_match_id uuid,
  p_reason text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_match public.matches%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Sign in to open a dispute.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_me and p.status = 'ACTIVE'
  ) then
    raise exception 'Only active members can open a dispute.';
  end if;

  select * into v_match
  from public.matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;
  if v_me <> v_match.player_a_id and v_me <> v_match.player_b_id then
    raise exception 'Only the two match players can open a dispute.';
  end if;
  if v_match.status <> 'RESULT_SUBMITTED' then
    raise exception 'A dispute can only be opened while a result is waiting for confirmation.';
  end if;
  if char_length(v_reason) not between 3 and 1000 then
    raise exception 'Give a reason between 3 and 1000 characters.';
  end if;
  if v_description is not null and char_length(v_description) > 2000 then
    raise exception 'Dispute description is too long.';
  end if;
  if exists (
    select 1 from public.disputes d
    where d.match_id = p_match_id
      and d.status in ('OPEN', 'UNDER_REVIEW')
  ) then
    raise exception 'This match already has an open dispute. Staff must resolve it first.';
  end if;

  insert into public.disputes
    (match_id, created_by, reason, description, status)
  values
    (p_match_id, v_me, v_reason, v_description, 'OPEN')
  returning id into v_id;

  update public.matches
  set status = 'DISPUTED', updated_at = now()
  where id = p_match_id;

  insert into public.audit_logs
    (actor_id, action, entity_type, entity_id, reason)
  values
    (v_me, 'DISPUTE_OPENED', 'match', p_match_id, v_reason);

  return v_id;
end;
$$;

revoke all on function public.dispute_match(uuid, text, text) from public, anon;
grant execute on function public.dispute_match(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
