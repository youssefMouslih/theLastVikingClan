# 4vs4 League - Implementation Plan

> Status: Phase 8 implementation closed; local checks and Part A catalog checks passed; Part B runtime checks deferred by the user; frontend deploy awaits explicit approval.
> Branch: `feature/4vs4-league-phase3`, based on `main` at `0762579`.
> Phase 0 produced this plan. Phase 1 added migration `0040`, its SQL catalog tests,
> and TypeScript row types. Phase 2 added migration `0041`, its catalog/manual tests,
> RPC input/result types, and notification types. Phase 3 added league services, UI
> pages/components, routes, Home/Competitions/Admin entry points, realtime
> invalidation, and EN/FR/AR translations. Phase 4 added the match page, lineup
> editor/view, four duel cards, start/substitution actions, hidden-lineup and
> reveal states, realtime invalidations, pure lineup helpers with Vitest coverage,
> and an adversarial SQL checklist. Phase 5 added result and dispute services,
> result/report/evidence/dispute components, match-page result wiring, a
> staff dispute queue, pure result helpers with Vitest coverage, and an
> adversarial SQL checklist. Phase 6 added standings/statistics pages,
> penalty and tiebreak admin panels, shared season/table components, pure
> standings helpers with Vitest coverage, and an adversarial SQL checklist.
> Phase 7 added migration `0042`, the every-10-minute `league_run_deadlines`
> cron, reminder markers, automatic forfeits/cancellations, notification deep
> links, realtime bindings, the Home league action card and an adversarial SQL
> checklist. Phase 8 added migration `0043` hardening indexes and trigger-grant
> revokes, an automated RLS/grant/realtime catalog test with a two-account
> adversarial checklist, a locale-parity Vitest guard and deployment docs.
> Phase 4 through Phase 8 changes are uncommitted on the branch.

## 1. Goal

Add a complete, secure, official 4vs4 team league to the existing The Last Viking
PWA:

- Persistent season-long squads with 6-8 players, a captain, invitations, admin
  approval, roster locks, and replacement rules.
- Weekly matchdays, double round-robin fixtures, byes for odd team counts.
- Hidden lineups with simultaneous reveal, four 1v1 duels per encounter.
- Atomic substitutions before a duel starts.
- Mandatory evidence, confirmations, disputes, forfeits, and admin resolution.
- Automatic encounter scoring, standings, tiebreaks, and player/team statistics.
- Notifications, realtime updates, audit trail, mobile-first UI, EN/FR/AR (RTL).

The existing War Council 3v3/4v4 squads feature is separate and must not be
replaced, renamed, or broken.

## 2. Non-Goals

- No second authentication system. Use `profiles.id` / `auth.users.id`.
- No replacement of the existing `competitions`, `matches`, `rounds`, or
  `squads` tables.
- No client-authoritative scores, points, standings, or tiebreaks.
- No public or anonymous access.
- No sixth bottom-navigation tab in this plan. The league is entered from the
  existing League/Competitions area and Home (see section 9).
- No general refactor of existing services or styling.
- No deployment to production without a separate approval.

## 3. Phase 0 Findings

### 3.1 Repository and stack

- Repo root: `C:\Users\user\Documents\clan\theLastVikingClan`; app in `app/`.
- React 19, TypeScript, Vite 8, React Router 8, TanStack Query, Zustand,
  Supabase JS, Tailwind v4, `vite-plugin-pwa`, Vitest, oxlint.
- Netlify: base `app`, build `npm run build`, publish `dist`; public env vars
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Netlify UI.
- Quality gate: `npm run check` (oxlint + tsc + Vitest).
- Current test count at planning time: 42 Vitest tests passing. README still
  says 34 and says FULL_SETUP ends at 0032; both are stale but harmless.

### 3.2 Existing building blocks to reuse

- Auth/roles: `profiles.role` is `OWNER | ADMIN | MODERATOR | PLAYER`;
  `profiles.status` must be `ACTIVE`; `public.is_clan_role(text[])` exists.
- Routing: `app/src/app/router.tsx` has auth guards and role guards.
- Design system: `app/src/index.css`, `components/ui/*`, `AppBar`,
  `BottomNav`, `StatusBadge`, `Avatar`, `Icon`, motion and countdown primitives.
- Competition engines: `app/src/competition/leagueEngine.ts` has a tested
  circle-method single round-robin generator; `standingsEngine.ts` has the
  existing points/GD/GF sorting pattern. The 4vs4 league needs its own
  double-round-robin wrapper and its own standings/tiebreak engine.
- Notifications: `notificationService.notify()` writes in-app rows and invokes
  the existing `send-push` Edge Function.
- Realtime: `app/src/hooks/useRealtime.ts` already invalidates match,
  competition, notification, announcement, and dispute query keys.
- Storage: `match-evidence` private bucket and signed-URL helper exist for
  screenshots; avatars/clan assets use separate buckets.
- Database migration convention: additive numbered SQL files plus an identical
  append to `app/supabase/FULL_SETUP.sql`; SQL checks in
  `app/supabase/tests/00NN_*_tests.sql`.
- Existing automation: migration `0036` uses `pg_cron` for Auto-Jarl, so a
  league deadline job can follow the same pattern.

### 3.3 Conflicts and important constraints

1. **Name collision with existing squads.** `0013_squads.sql`,
   `squadService.ts`, and `components/battle/SquadsTab.tsx` implement an
   ephemeral War Council 3v3/4v4 squad for a single battle. It has size 3/4 and
   no season, roster locking, or league lifecycle. It must not be reused for the
   league and must not be altered.
2. **No dedicated schema exposure is configured.** All existing client calls
   use the default `public` schema. A new Postgres schema would require exposing
   it through Supabase API settings and changing the client. Recommended default:
   `public` tables prefixed `league_` (for example `league_teams`).
3. **Existing `disputes` and `match_evidence` are match-specific.**
   `disputes.match_id` references `matches`; league duels are not regular
   matches. Use dedicated league tables and reuse only the private storage
   bucket, not the existing dispute rows.
4. **Existing "League" tab means competitions.** Bottom nav already has five
   tabs and a five-column grid. Adding a sixth would require a navigation
   redesign. Add a 4vs4 card/link inside `/competitions` and Home instead.
5. **Prior hardening is pushed but not confirmed deployed.** Migrations
   0034-0039 are on the branch but not verified as applied to Supabase. League
   migration `0040+` must assume they are applied and must not bypass their
   guards. Deploying the prior migrations and `accept-tryout` is a prerequisite
   for meaningful end-to-end testing.
6. **Known open review findings remain.** They are outside this feature's scope,
   but the 4vs4 implementation must not copy the vulnerable patterns found in
   the challenge/competition code: client-set statuses, client timestamps,
   client-computed points, or broad write policies.
7. **Timezone.** Existing convention is UTC in the database and
   Africa/Casablanca for clan display. Use timestamptz everywhere and format in
   the app; do not store local dates.
8. **i18n.** `dictionaries.ts` en/fr/ar key sets are enforced by the `Dict`
   type. Every new UI string needs all three locales.

## 4. Authoritative Rules

These rules must hold in the database or in SECURITY DEFINER functions, not only
in React.

### 4.1 Season and squads

- A season has registration, active, completed, and archived states.
- A squad has one captain and 6-8 unique active players.
- A player may hold active membership in at most one squad per season. This is a
  partial unique database index, not only service logic.
- Invitations are private; the invited player accepts or declines.
- The captain can invite, remove, or transfer captaincy within the rules.
- A squad must be approved by an admin before fixtures are generated.
- Rosters lock at registration close. After that, only an admin can perform a
  replacement, before the next matchday; history is preserved.
- One player cannot be replaced into a second squad in the same season.
- A squad cannot have more than 8 or fewer than 6 active members.

### 4.2 Fixtures and matchdays

- Double round-robin: every squad plays every other squad home and away.
- Odd team count: one squad has a bye each round; byes never award points.
- Each matchday lasts 7 days by default (admin-configurable per season).
- Fixtures in the same matchday share open/deadline timestamps.
- Admin can extend a deadline with an audit entry; players cannot.
- Fixture generation is locked once previewed/started; regeneration requires an
  explicit admin reset that refuses to destroy played results.

### 4.3 Lineups and duels

- Each squad submits exactly 4 starters and 2-4 substitutes from its active
  roster, with no duplicate player.
- Starters occupy duel slots 1-4. Slot N of the home squad faces slot N of the
  away squad. This is transparent and avoids client-side randomness.
- A lineup is visible only to its own squad until both squads submit, or until
  the lineup deadline passes. Then both are revealed simultaneously.
- Four duels are created only when both valid lineups exist, or by admin
  resolution after a deadline forfeit.
- Every duel must produce a decisive winner. Final scores cannot be equal; a
  match that goes to extra time or penalties is reported with its deciding
  final score.
- A substitution is allowed only before the duel starts. The operation is one
  atomic RPC that locks the duel, verifies the substitute is an eligible bench
  player, records the substitution, and updates the duel assignment.
- One substitution per squad per duel. A bench player can be used in at most one
  duel per fixture. A substituted-out starter cannot return.

### 4.4 Results, evidence, disputes

- Each participant submits their own score and mandatory screenshot evidence.
- When both reports mirror each other, the duel auto-confirms.
- When reports disagree, the duel becomes DISPUTED; it cannot be confirmed by a
  participant.
- A single report may be accepted by the opponent (one-tap confirm) before or
  after the opponent submits.
- Admin/moderator can confirm, set a score, forfeit, or cancel a duel with a
  mandatory reason. Every resolution is audited.
- Evidence is uploaded to the private `match-evidence` bucket under a
  `league/...` path; only signed URLs are rendered.
- Forfeit of a duel awards a win to the non-offending squad. A whole-fixture
  forfeit is recorded as 4-0 for encounter scoring.
- Missing both lineups is a double forfeit with 0 encounter points each and an
  admin note; it is never silently scored as a draw.

### 4.5 Scoring, standings, tiebreaks

- Encounter result is the number of duel wins: 4-0 -> 3/0; 3-1 -> 3/0;
  2-2 -> 1/1; 1-3 -> 0/3; 0-4 -> 0/3.
- Only completed/forfeited fixtures count. A fixture is not final until all
  four duel outcomes are final or admin-resolved.
- Standings order:
  1. encounter points (including penalties);
  2. duel difference (duel wins minus duel losses);
  3. duels won;
  4. head-to-head encounter points among the tied teams;
  5. head-to-head duel difference among the tied teams;
  6. admin tiebreak order;
  7. team name as a deterministic final fallback.
- Penalties are recorded as separate auditable rows and subtracted from points.
- Standings are computed server-side from stored fixture/duel data. The client
  may display a computed snapshot but cannot submit points.

## 5. Proposed Architecture Decisions

These were the approved defaults before Phase 1. Any of them can still be
changed by explicit approval.

| ID | Decision | Recommendation |
|----|----------|----------------|
| D1 | Schema placement | Use `public` with `league_` table prefix. A separate schema would require Supabase API exposure and client changes for little benefit here. |
| D2 | Squad storage | New `league_*` tables. Do not reuse or modify `squads` / `squad_members`. UI label "League Squad" inside the 4vs4 area to distinguish War Council squads. |
| D3 | Write path | RLS allows reads only (plus private invite/report visibility). All mutations go through SECURITY DEFINER RPCs with explicit authorization, row locks, and validation. No direct client INSERT/UPDATE on authoritative tables. |
| D4 | Duels pairing | Fixed slot pairing: starter slot 1 vs slot 1, etc. |
| D5 | Substitution lock | A duel is "started" when a participant starts it or submits the first result. Substitutions are allowed only while `started_at is null` and no report exists. |
| D6 | Team count | Admin-configurable 4-16 teams per season, default 8. Double RR supports even and odd counts. |
| D7 | Result confirmation | Both mirrored reports auto-confirm; mismatched reports become a dispute; one report can be accepted by the opponent; otherwise admin resolves at the deadline. |
| D8 | Deadline automation | One `pg_cron` job (every 5-15 minutes) opens/closes matchdays, reveals lineups, forfeits missing lineups, and notifies. It never guesses a disputed score. |
| D9 | Evidence storage | Reuse the existing private `match-evidence` bucket under `league/{season_id}/{fixture_id}/{duel_id}/...`; do not create a second evidence bucket. |
| D10 | Navigation | Add a prominent 4vs4 League card on `/competitions` and Home; no sixth bottom tab. |
| D11 | Admin access | OWNER/ADMIN manage seasons, teams, fixtures, penalties. OWNER/ADMIN/MODERATOR resolve league disputes. |
| D12 | Migration layout | `0040_league4v4_schema.sql`, `0041_league4v4_functions.sql`, `0042_league4v4_deadlines.sql`, `0043_league4v4_hardening.sql`; append each to FULL_SETUP as it is completed. |
| D13 | Optional logos | Support optional squad logo uploads via a private `league-assets` bucket in a later phase. Fall back to initials/emblem. If this adds deployment friction, defer logos. |
| D14 | Season concurrency | Allow multiple seasons in DRAFT; only one ACTIVE season at a time (enforced by a partial unique index or RPC check). |

## 6. Data Model

All tables use `uuid` primary keys, `timestamptz` timestamps, and explicit CHECK
constraints. FKs use `on delete restrict` or `cascade` deliberately; no hard
delete of started seasons.

### 6.1 Tables

#### `league_seasons`

- `id`, `name`, `description`, `status`
  (`DRAFT|REGISTRATION|ACTIVE|COMPLETED|ARCHIVED`)
- `registration_opens_at`, `registration_closes_at`, `starts_at`
- `matchday_days` default 7
- `min_teams` default 4, `max_teams` default 8
- `roster_min` default 6, `roster_max` default 8
- `points_win` 3, `points_draw` 1, `points_loss` 0
- `created_by`, `created_at`, `updated_at`
- CHECK registration window and start ordering; CHECK roster_min=6,
  roster_max=8 for 4vs4.

#### `league_teams`

- `id`, `season_id`, `name`, `logo_path`, `captain_id`
- `status` (`PENDING|APPROVED|REJECTED|WITHDRAWN|DISQUALIFIED`)
- `approved_by`, `approved_at`, `admin_note`, `created_at`, `updated_at`
- Unique case-insensitive `(season_id, name)`.
- Partial unique `(season_id, captain_id)` for non-rejected/withdrawn teams.
- Composite key support so members cannot point at a team in another season.

#### `league_team_members`

- `id`, `season_id`, `team_id`, `player_id`
- `role` (`CAPTAIN|PLAYER`)
- `status` (`ACTIVE|LEFT|REMOVED|REPLACED`)
- `joined_at`, `joined_matchday`, `left_at`, `replaced_by`, `replaced_at`
- Partial unique `(season_id, player_id) WHERE status='ACTIVE'`.
- Partial unique `(team_id, role) WHERE role='CAPTAIN' AND status='ACTIVE'`.
- CHECK `replaced_by <> player_id`.
- Roster size is validated at approval, lineup submission, and replacement.

#### `league_team_invites`

- `id`, `season_id`, `team_id`, `player_id`, `invited_by`
- `status` (`PENDING|ACCEPTED|DECLINED|REVOKED|EXPIRED`)
- `message`, `created_at`, `expires_at`, `responded_at`
- Partial unique `(team_id, player_id) WHERE status='PENDING'`.
- Cannot invite the captain or an already active member.
- Expiry is capped by registration close.

#### `league_matchdays`

- `id`, `season_id`, `number`, `opens_at`, `deadline`
- `status` (`SCHEDULED|OPEN|CLOSED|COMPLETED`)
- Unique `(season_id, number)`; CHECK `deadline > opens_at`.

#### `league_fixtures`

- `id`, `season_id`, `matchday_id`, `leg` (1 or 2)
- `home_team_id`, `away_team_id`
- `status`
  (`SCHEDULED|LINEUPS_PENDING|LINEUPS_REVEALED|IN_PROGRESS|COMPLETED|FORFEITED|CANCELLED`)
- `home_duel_wins`, `away_duel_wins` (0-4)
- `home_points`, `away_points` (0/1/3)
- `revealed_at`, `completed_at`, `admin_note`, `created_at`, `updated_at`
- Unique `(season_id, leg, home_team_id, away_team_id)`.
- CHECK different teams; CHECK points only valid encounter values.
- Byes are recorded separately (optional table `league_byes`) and award nothing.

#### `league_lineups`

- `id`, `fixture_id`, `team_id`, `submitted_by`, `submitted_at`, `version`
- `status` (`DRAFT|SUBMITTED|REVEALED|LOCKED`)
- Unique `(fixture_id, team_id)`.
- Resubmission allowed until both lineups are submitted or the deadline passes;
  after reveal it is locked.

#### `league_lineup_players`

- `id`, `lineup_id`, `player_id`, `role` (`STARTER|SUB`), `slot` 1-4
- Unique `(lineup_id, player_id)` and `(lineup_id, role, slot)`.
- Trigger validates on submission: exactly 4 starters, 2-4 subs, all active
  members of that team and season, no duplicates.

#### `league_duels`

- `id`, `fixture_id`, `matchday_id`, `slot` 1-4
- `home_team_id`, `away_team_id`, `home_player_id`, `away_player_id`
- `status`
  (`SCHEDULED|STARTED|AWAITING_RESULTS|DISPUTED|CONFIRMED|FORFEITED|CANCELLED`)
- `started_at`, `deadline`, `home_score`, `away_score`, `winner_team_id`
- `confirmed_at`, `resolved_by`, `resolution_note`, `created_at`, `updated_at`
- Unique `(fixture_id, slot)`, unique assigned player per fixture/side.
- CHECK home/away team differ; scores 0-99; winner is one of the two teams.
- Created only at lineup reveal or by admin resolution.

#### `league_substitutions`

- `id`, `duel_id`, `fixture_id`, `team_id`
- `out_player_id`, `in_player_id`, `requested_by`, `created_at`
- Unique `(duel_id, team_id)` (one substitution per squad per duel).
- Unique `(fixture_id, team_id, in_player_id)` (bench player used once).
- CHECK out/in player differ.

#### `league_duel_reports`

- `id`, `duel_id`, `player_id`, `team_id`, `side` (`HOME|AWAY`)
- `score_for`, `score_against`, `decided_by`
  (`REGULATION|EXTRA_TIME|PENALTIES`)
- `evidence_path`, `note`
- `status` (`SUBMITTED|CONFIRMED|DISPUTED|REJECTED`)
- `submitted_at`, `updated_at`
- Unique `(duel_id, player_id)`.
- CHECK decisive score (`score_for <> score_against`), scores 0-99, evidence not
  empty.

#### `league_disputes`

- `id`, `duel_id`, `opened_by`, `reason`, `evidence_path`
- `status` (`OPEN|UNDER_REVIEW|RESOLVED|REJECTED`)
- `resolution`, `resolved_by`, `resolved_at`, `created_at`
- Partial unique open/under-review dispute per duel.

#### `league_penalties`

- `id`, `season_id`, `team_id`, `matchday_id`, `points`
- `reason`, `created_by`, `created_at`
- Points are negative deductions (or an explicit adjustment signed integer);
  standings subtract/add them. Every row is audited.

#### `league_tiebreak_orders`

- `id`, `season_id`, `team_id`, `position`, `reason`, `created_by`, `created_at`
- Admin-only, used only after the automatic tiebreak chain.

#### `league_audit_logs`

- `id`, `season_id`, `actor_id`, `action`, `entity_type`, `entity_id`
- `old_data jsonb`, `new_data jsonb`, `reason`, `created_at`
- Inserted by definer RPCs/triggers, not directly by clients.

#### Optional tables/objects

- `league_byes` (`season_id`, `matchday_id`, `team_id`) for explicit bye display.
- `league_standings(p_season_id)` SQL function returning ranked rows.
- `league_player_stats(p_season_id, p_player_id)` SQL function or view.
- `league_team_stats(p_season_id, p_team_id)`.

### 6.2 Indexes and invariants

- Partial unique index for one active squad per player per season.
- Partial unique index for one active captain per squad.
- Unique fixture pair/leg and unique duel slot.
- Roster and lineup counts validated by trigger/functions, not just UI.
- All status transitions validated by triggers/RPCs; no arbitrary UPDATE.
- Server timestamps only for `submitted_at`, `confirmed_at`, `started_at`,
  `revealed_at`, `completed_at`.
- No client-supplied `winner_team_id`, points, or standings.

## 7. Server API (RPCs)

All functions: `security definer`, `set search_path = public, pg_temp`,
`auth.uid()` authorization, row locks, and `revoke all ... from public, anon`
then `grant execute ... to authenticated`. Admin-only functions additionally
check `public.is_clan_role(array['OWNER','ADMIN'])`; dispute functions accept
`OWNER|ADMIN|MODERATOR`.

### Season / admin

- `league_set_season_status(season_id, status, reason)`
- `league_generate_fixtures(season_id)` - double RR, matchdays, byes; refuses if
  any fixture has started unless an explicit reset flag and no results exist.
- `league_extend_matchday(matchday_id, new_deadline, reason)`
- `league_approve_team(team_id, approve, note)`
- `league_replace_member(team_id, out_player_id, in_player_id, reason)`
- `league_apply_penalty(season_id, team_id, points, reason)`
- `league_set_tiebreak_order(season_id, team_ids uuid[], reason)`
- `league_resolve_dispute(dispute_id, outcome, score, reason)`

### Squad / membership

- `league_create_team(season_id, name, logo_path)`
- `league_update_team(team_id, name, logo_path)`
- `league_invite_player(team_id, player_id, message)`
- `league_answer_invite(invite_id, accept)`
- `league_leave_team(team_id)`
- `league_remove_member(team_id, player_id, reason)`
- `league_transfer_captain(team_id, new_captain_id)`

### Lineups / duels

- `league_submit_lineup(fixture_id, players jsonb)` - 4 starters + 2-4 subs;
  validates roster and locks once revealed.
- `league_start_duel(duel_id)` - optional explicit start; either assigned player.
- `league_substitute(duel_id, out_player_id, in_player_id)` - only before start;
  atomic.
- `league_submit_duel_result(duel_id, score_for, score_against, decided_by,
  evidence_path, note)` - participant only; upserts own report.
- `league_confirm_duel_result(duel_id, report_id)` - opponent only.
- `league_dispute_duel(duel_id, reason, evidence_path)` - participant only.
- `league_admin_resolve_duel(duel_id, outcome, home_score, away_score, reason)`
  - confirm/set/forfeit/cancel.

### Internal / read models

- `league_maybe_reveal_fixture(fixture_id)` - called after lineup submission;
  creates duels once both lineups exist.
- `league_finalize_fixture(fixture_id)` - idempotent; computes duel wins and
  encounter points.
- `league_run_deadlines()` - cron entry point.
- `league_standings(season_id)` - ranked table with tiebreaks and penalties.
- `league_player_stats(season_id, player_id)`.
- `league_can_view_lineup(fixture_id, team_id)` - security-definer helper used
  by RLS; returns false to opponents until reveal.

### Idempotency and concurrency

- Unique constraints and `INSERT ... ON CONFLICT` for reports/invites.
- `SELECT ... FOR UPDATE` on season, fixture, duel, and membership rows.
- Finalization is idempotent; repeated RPC/cron calls cannot double-award points.
- Notifications are deduplicated by event rows or `ON CONFLICT` where needed.

## 8. RLS and Authorization

RLS is enabled on every league table. Clients get read access matching the table
below. Mutations are RPC-only; no direct INSERT/UPDATE/DELETE policies except
where explicitly noted.

| Table | SELECT policy | Direct writes |
|-------|---------------|---------------|
| `league_seasons` | authenticated | none (RPC) |
| `league_teams` | authenticated | none (RPC) |
| `league_team_members` | authenticated | none (RPC) |
| `league_team_invites` | invited player, team captain, staff | none (RPC) |
| `league_matchdays` | authenticated | none (RPC) |
| `league_fixtures` | authenticated | none (RPC) |
| `league_lineups` | own squad; opponent only after reveal; staff | none (RPC) |
| `league_lineup_players` | same visibility as its lineup | none (RPC) |
| `league_duels` | authenticated after creation | none (RPC) |
| `league_substitutions` | authenticated (lineups already revealed) | none (RPC) |
| `league_duel_reports` | assigned players, opponent after confirm, staff | none (RPC) |
| `league_disputes` | involved players, staff | none (RPC) |
| `league_penalties` | authenticated | none (RPC) |
| `league_tiebreak_orders` | authenticated | none (RPC) |
| `league_audit_logs` | staff | none (RPC/trigger) |

Additional rules:

- Hidden lineups: `league_can_view_lineup` returns true for staff, for the owning
  squad's active members/captain, and for opponents only when the fixture is
  `LINEUPS_REVEALED`/later. It must be `stable security definer` with a fixed
  search path and must not leak row existence in error messages.
- A player can read their own invite and reports even if they are no longer on
  the roster, preserving history.
- Admin functions are not enough by themselves: RLS still prevents direct table
  tampering.
- Storage:
  - result evidence uses `match-evidence`, path
    `league/{season_id}/{fixture_id}/{duel_id}/{player_id}-{timestamp}.ext`;
  - RPC validates the path prefix, uploader, file type, and size via
    `storage.objects`;
  - rendering uses `createSignedUrl` only;
  - optional team logos use a private `league-assets` bucket if D13 is approved.

## 9. Frontend Integration

### Routes

| Route | Page | Access |
|-------|------|--------|
| `/4vs4` | season hub: status, my squad, next fixture, top standings | authenticated |
| `/4vs4/teams` | squad directory | authenticated |
| `/4vs4/teams/:id` | squad profile and roster | authenticated |
| `/4vs4/teams/create` | create squad and invite players | authenticated |
| `/4vs4/my-team` | captain/member controls, invites, roster | authenticated |
| `/4vs4/fixtures` | matchdays, fixtures, results | authenticated |
| `/4vs4/match/:fixtureId` | fixture, lineups, 4 duels, reports | authenticated |
| `/4vs4/standings` | ranked table and tiebreak notes | authenticated |
| `/4vs4/stats` | season player/team statistics | authenticated |
| `/4vs4/disputes` | league dispute queue | OWNER/ADMIN/MODERATOR |
| `/4vs4/admin` | season, teams, fixtures, penalties, audit | OWNER/ADMIN |

Routing changes are additive in `app/src/app/router.tsx`, with the existing
`RequireAuth` / `RequireRole` guards. No route may bypass the forced-password
check.

### Entry points

- `/competitions`: add a top "4vs4 League" card with current season, my squad,
  and next fixture.
- Home: add a compact "4vs4 League" card only when a season is active or the
  player has a pending lineup/result action.
- No BottomNav change. If a sixth tab is later desired, that is a separate UX
  approval.

### Pages and components

- `src/pages/League4v4HubPage.tsx`
- `src/pages/League4v4TeamsPage.tsx`
- `src/pages/League4v4TeamPage.tsx`
- `src/pages/League4v4CreateTeamPage.tsx`
- `src/pages/League4v4MyTeamPage.tsx`
- `src/pages/League4v4FixturesPage.tsx`
- `src/pages/League4v4MatchPage.tsx`
- `src/pages/League4v4StandingsPage.tsx`
- `src/pages/League4v4StatsPage.tsx`
- `src/pages/League4v4AdminPage.tsx` (tabs for seasons, teams, fixtures,
  penalties, audit)
- `src/pages/League4v4DisputesPage.tsx`
- `src/components/league4v4/*`: season header, team card, roster list, invite
  picker, fixture card, lineup editor, hidden/revealed lineup, duel card, result
  form with evidence, confirm/dispute action, standings table, penalty/audit
  panels.

Use existing primitives and CSS classes (`page`, `card`, `card-title`,
`btn-primary`, `btn-ghost`, `input`, `StatusBadge`, `Avatar`, `Icon`,
`Countdown`, `FadeIn`, `LoadingRegion`). Keep mobile-first and 44px targets.
Do not introduce a new UI library.

### Services / state

- `src/services/leagueSeasonService.ts`
- `src/services/leagueTeamService.ts`
- `src/services/leagueFixtureService.ts`
- `src/services/leagueDuelService.ts`
- `src/services/leagueStandingsService.ts`
- `src/services/leagueAdminService.ts`
- `src/services/leagueStatsService.ts`
- `src/competition/league4v4/fixtures.ts` (pure double-RR wrapper)
- `src/competition/league4v4/scoring.ts`
- `src/competition/league4v4/standings.ts`
- `src/competition/league4v4/lineup.ts`
- `src/competition/league4v4/state.ts`
- Types in `src/types/league4v4.ts` (do not bloat `database.ts`).

Query keys follow `['league', ...]`:
`['league','season',id]`, `['league','season',id,'teams']`,
`['league','fixture',id]`, `['league','standings',seasonId]`, etc.

### i18n and UX

- Add all keys to en/fr/ar; `Dict = typeof en` must stay green.
- Dates use `fmtDate`; statuses use translated labels, not raw enum text.
- Arabic RTL must be tested for tables, lineup slots, and result forms.
- Empty, loading, error, locked, deadline-passed, and unauthorized states are
  explicit.
- Evidence images open in the existing zoom/lightbox pattern.
- No hidden lineup data is ever shipped to the opponent's browser; hiding with
  CSS alone is forbidden.

## 10. Notifications and Realtime

### Notification types to add

`LEAGUE_INVITE`, `LEAGUE_TEAM_APPROVED`, `LEAGUE_TEAM_REJECTED`,
`LEAGUE_MATCHDAY_OPEN`, `LEAGUE_LINEUP_REMINDER`, `LEAGUE_LINEUP_REVEALED`,
`LEAGUE_DUEL_READY`, `LEAGUE_RESULT_SUBMITTED`, `LEAGUE_RESULT_CONFIRMED`,
`LEAGUE_DISPUTE_OPENED`, `LEAGUE_DISPUTE_RESOLVED`, `LEAGUE_SANCTION`.

- Extend `NotificationType` in `notificationService.ts`.
- Use `notify()` after authoritative RPC success; failures remain non-fatal.
- Add entity types `league_fixture`, `league_duel`, `league_team`,
  `league_season`.
- Update `NotificationsPage.tsx` deep links for these entity types with new
  i18n keys.
- Do not let client-supplied notification text become authoritative; use fixed
  templates and IDs.

### Realtime

- Add the league tables to the `supabase_realtime` publication.
- Extend the single `vik-live` channel in `useRealtime.ts` (preferred) rather
  than creating many channels.
- Invalidate league query keys on fixture/duel/report/lineup/team changes.
- Lineup RLS means the opponent must not receive hidden lineup rows; reveal is
  signaled by a visible fixture/lineup status update.
- Keep the existing focus-refetch fallback; realtime is not guaranteed.

## 11. Testing Strategy

### Pure Vitest

- Double round-robin for 4/5/6/8/16 teams: no duplicate pairings, both legs,
  correct byes, correct matchday counts.
- Slot pairing and lineup validation: 4 starters, 2-4 subs, duplicates, wrong
  roster, inactive member.
- State machines: lineup submission/reveal, duel start, substitution, report,
  confirm, dispute, admin resolution, fixture finalization.
- Scoring: all five encounter outcomes; 2-2 gives one point each.
- Standings: points, duel difference, duels won, head-to-head, admin order,
  penalties, form.
- Deadline transitions and idempotency.

### SQL tests

Use `begin; ... rollback;` scripts under `app/supabase/tests/`. Existing SQL
tests are largely catalog assertions; the league tests must add behavioral
checks:

- constraints: one active membership per season, one captain, unique fixture,
  unique duel slot, decisive score, roster/lineup counts;
- RLS: direct writes denied; hidden lineup invisible to opponent; visible after
  reveal; reports only to participants; invite only to invitee/captain/staff;
  audit only to staff;
- RPC authorization: non-captain cannot invite/submit lineup/substitute;
  non-participant cannot report; wrong-season IDs rejected; cross-team IDs
  rejected;
- attacks: duplicate invite/membership, roster overflow, sub after start,
  double report, edited confirmed report, fake evidence path, double
  finalization, direct points injection;
- idempotency: repeated reveal/finalize/confirm calls do not duplicate rows or
  points.

For authenticated SQL simulations, use a transaction with
`set local role authenticated` and `request.jwt.claims` for test users, then
`rollback`. Document the exact snippet in the test file header because SQL
editor behavior can vary.

### Manual / browser

- Two accounts in separate browsers: hidden lineups, simultaneous reveal,
  substitution, result, confirm, mismatch dispute, admin resolution.
- 4-team and 8-team season; odd-team bye; deadline extension; forfeits.
- Standings and tiebreak scenarios, including 2-2.
- Notifications + deep links + push; realtime updates; PWA refresh/offline shell.
- EN/FR/AR, RTL, light/dark, mobile widths, keyboard/focus.
- Regression: `/competitions`, `/battles` War Council squads, `/matches`,
  `/squad` behavior, auth, profile, existing 42 tests.

### Quality gate

Run `npm run check` after every phase and before any handoff. Add SQL test
results to the phase report. Do not claim a browser flow was tested unless it
was actually run.

## 12. Migrations and Deployment

Planned migrations:

1. `0040_league4v4_schema.sql`
   - tables, checks, indexes, triggers, RLS, realtime publication, storage
     policies (and optional `league-assets` bucket).
2. `0041_league4v4_functions.sql`
   - SECURITY DEFINER RPCs, reveal/finalize helpers, standings/stats functions,
     grants/revokes.
3. `0042_league4v4_deadlines.sql`
   - `league_run_deadlines()`, pg_cron schedule, deadline notifications.
4. `0043_league4v4_hardening.sql`
   - deadline/schedule performance indexes and trigger-helper grant revokes;
     no policy or RPC changes.

Each migration is additive and idempotent where practical (`if not exists`,
`create or replace`, guarded drops). Append the exact file content to
`app/supabase/FULL_SETUP.sql` after verification, using the repository's
existing CRLF/append convention, and verify with `Compare-Object`.

Deployment prerequisites:

- Apply 0034-0039 and deploy `accept-tryout` if not already done.
- Enable `pg_cron`; the existing 0036 job already depends on it.
- Add league tables to the realtime publication.
- Verify private `match-evidence` bucket and signed URL access.
- Apply migrations in numeric order; test on a staging/branch database first if
  available.

No environment variables or new npm dependencies are expected. If a dependency
is needed, stop and ask before adding it.

## 13. Phase Plan

Each phase ends with a report and a hard stop for approval. No phase may start
before the previous phase is approved.

### Phase 0 - Inspection and plan (complete)

- Inspected repo, schema, auth, engines, UI conventions, migrations, tests,
  deploy.
- Created this plan and the feature branch.
- Exit: user approves the plan and the decisions in section 5.

### Phase 1 - Database foundation (implemented)

- Write `0040`: tables, constraints, indexes, triggers, RLS, realtime
  publication. Reuse the existing private `match-evidence` bucket; RPC-side
  `league/` path validation lands in Phase 2, so no storage policy change here.
- Add TypeScript league types.
- Add SQL constraint/RLS catalog tests.
- No UI and no RPC business logic yet.
- Exit: migration applies cleanly, RLS enabled on every table, tests pass.
  SQL parser checks pass locally; execution against Supabase/staging still
  required before Phase 2 is considered deployed.

### Phase 2 - Server functions (implemented)

- Write `0041`: squad, invite, approval, fixture generation, lineup/reveal,
  duel, report, substitution, dispute, penalty, audit, standings functions.
- Add catalog/source tests and a manual end-to-end checklist, including
  adversarial cases.
- Exit: every authoritative mutation is RPC-only and covered by catalog/source
  tests plus the manual checklist; no UI yet. SQL parser checks pass locally;
  execution against Supabase/staging is still required before Phase 2 is
  considered deployed.

### Phase 3 - Season, squads, invitations, fixtures UI (implemented; browser verification pending)

- Hub, teams, team detail, create squad, my team, admin season/team approval.
- Fixture generation and matchday display.
- i18n for these screens.
- Implemented routes: `/4vs4`, `/4vs4/teams`, `/4vs4/teams/create`,
  `/4vs4/teams/:id`, `/4vs4/my-team`, `/4vs4/fixtures`, `/4vs4/admin` (staff).
- Implemented services: `leagueKeys`, `leagueSeasonService`, `leagueTeamService`,
  `leagueFixtureService`, `leagueAdminService`; writes remain RPC-only.
- Implemented components/pages plus Home, Competitions and Admin entry points;
  league table realtime invalidation; EN/FR/AR translations.
- Admin activation is gated on approved-team count and scheduled fixture count;
  completion is gated on every fixture being final.
- Local validation: `npm run check` (0 lint errors / 22 baseline warnings,
  typecheck clean, 42/42 tests) and `npm run build` passed.
- Exit: a full 4-8 team season can be created, approved, and scheduled in the
  browser with two accounts.
- **Not yet verified**: requires a live Supabase backend and enough test accounts
  to satisfy the 6-player roster minimum per approved team; with only two
  accounts, use seeded/pre-existing members or add synthetic test accounts.
  No browser run or SQL runtime execution has been performed locally.

### Phase 4 - Lineups, reveal, duels, substitutions

- Lineup editor, hidden/revealed states, duel cards, start and substitute.
- Realtime/visibility tests.
- Exit: hidden lineups cannot be read by opponents; reveal creates exactly four
  duels; substitution is atomic and locks after start.

### Phase 5 - Results, evidence, confirmations, disputes

- Result forms, screenshot upload, confirm/dispute, admin resolution, fixture
  finalization.
- Exit: matched reports auto-confirm; mismatches dispute; admin resolution
  updates the fixture; no client can set points.

### Phase 6 - Standings, penalties, statistics

- Implemented locally: `/4vs4/standings`, `/4vs4/stats`, penalty/tiebreak admin
  panels, shared standings table and season picker, pure standings helpers and
  Vitest coverage, EN/FR/AR labels, and a SQL catalog/adversarial checklist.
- Exit: standings match hand-computed results for 4/8 teams, including 2-2,
  penalties, head-to-head, and admin tiebreak. Browser/SQL verification pending.

### Phase 7 - Deadlines, notifications, realtime

- Implemented locally: `0042` adds the internal `league_run_deadlines()` runner
  and a `vik-league-deadlines` pg_cron job every 10 minutes. It opens due
  matchdays, sends one 24h lineup reminder per squad/matchday, reveals complete
  lineups, awards a 4-0 forfeit when one squad missed the deadline, cancels a
  fixture when both missed it, and completes a matchday when every fixture is
  final. State changes are conditional on status transitions and reminder
  markers are unique, so duplicate runs are no-ops; the runner never guesses a
  duel result.
- Added notification types, `notificationPath` deep links (fixture -> match,
  duel -> redirect to match, team/season/matchday -> league screens), a duel
  redirect route, realtime bindings for invites, byes, substitutions,
  penalties and tiebreak orders, and a Home/Competitions league action card for
  lineup, start, report and confirm actions.
- Exit: deadline simulation works; notifications link correctly; duplicate
  cron runs are idempotent. Local Vitest covers the action and deep-link
  helpers; SQL/browser/realtime verification pending.

### Phase 8 - Integration, security, regression, deployment readiness

- Implemented locally:
  - Home/Competitions entry points and action card were already wired; no
    sixth bottom tab.
  - `0043_league4v4_hardening.sql` adds indexes for cron matchday/fixture
    scans, schedule byes and standings/stats season filters, and revokes the
    default PUBLIC EXECUTE on internal trigger helpers. No RLS, table or RPC
    changes; the Phase 8 review found no policy gaps.
  - `app/supabase/tests/0043_league4v4_phase8_tests.sql` asserts RLS on every
    league table, SELECT-only policies, guarded definer functions, anon and
    internal-function denials, the 14 published realtime tables and the new
    indexes; Part B is a two-account adversarial/regression/deployment
    checklist (hidden lineups, direct writes, RPC denials, existing features,
    EN/FR/AR/RTL, accessibility, performance).
  - `dictionaries.test.ts` guards locale parity, non-empty translations and
    Arabic RTL; README documents the `0001`-`0043` range, pg_cron prerequisite
    and SQL-editor-only runner.
- Part A catalog checks passed in the deployed project. On 2026-10-20 the user
  chose to defer Part B runtime checks and close the implementation phase;
  they remain documented for later, and a separate production deploy approval
  is still required.

## 14. Risks and Open Decisions

### Risks

- Hidden lineups are the highest-risk area; a single RLS mistake leaks them.
  Test with two real accounts and direct PostgREST calls, not just the UI.
- RPCs using SECURITY DEFINER can bypass triggers/RLS; every function needs its
  own authorization and path validation.
- Race conditions around lineup reveal, substitution, and fixture finalization
  need row locks and unique constraints.
- Deadline automation can create false forfeits; it must only act on missing
  lineups/reports, never invent scores.
- Existing 0034-0039 deployment status and open review findings could affect
  auth/RLS testing. Confirm the deployed schema before Phase 3.
- 8-team double RR is 14 matchdays (about 14 weeks); confirm this duration is
  acceptable or reduce default team count.
- Adding many realtime tables can increase load; use one channel and scoped
  invalidations.

### Decisions requested before Phase 1

1. Approve `public.league_*` tables (D1) rather than a dedicated schema.
2. Approve new league tables and leaving War Council squads untouched (D2).
3. Approve slot pairing and the duel "start" rule for substitutions (D4/D5).
4. Approve default 8 teams / 4-16 configurable (D6).
5. Approve the result flow and deadline automation (D7/D8).
6. Approve reusing `match-evidence` and no sixth nav tab (D9/D10).
7. Confirm that 0034-0039 should be deployed before browser testing.
8. Confirm whether squad logos are required in the first implementation or can
   be deferred (D13).

## 15. Definition of Done

- A season can be created, teams approved, fixtures generated, and matchdays
  opened.
- A squad can be created with 6-8 players, invitations, captain controls,
  roster lock, and admin replacement.
- Each fixture has exactly four decisive duels with hidden-then-revealed
  lineups and audited substitutions.
- Results require evidence, support confirmation/dispute/admin resolution, and
  cannot be faked or double-counted.
- Standings and stats are automatic, correct, and server-derived; tiebreaks and
  penalties work.
- Notifications and realtime work; deep links land on the correct league page.
- RLS and adversarial tests pass; existing features and `npm run check` remain
  green.
- FULL_SETUP is in sync, deployment steps are documented, and no change is
  deployed to production without explicit approval.
