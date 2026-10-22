# Viking QA / 4vs4 — Handoff (Oct 21, 2026)

Context for completing this work on another PC. Repo may contain uncommitted
4vs4 work alongside this QA state — see `git log` for what is already there.

## Objective

1. Fix the confirmed non-4vs4 QA bugs via migration `0044_non4_qa_fixes.sql`
   (B4 admin→OWNER escalation, D3 open-mat acceptance, D10 throne pledge
   redirect, E2 squad leader invites, E3 squad leader joins, plus F1 public
   tryout insert).
2. Rerun `qa/vik_non4_qa.mjs` until 48/48 passes.
3. Leave the DB in clean base state after QA. 4vs4 Phase 8 Part B (manual
   browser QA) remains deferred.
4. Apply `0053`, then verify the 1v1 dispute RPC and the under-review card.

## Where things stand

- Migration `app/supabase/migrations/0044_non4_qa_fixes.sql` written and
  syntax-validated with pglast (15 statements).
- Migration `app/supabase/migrations/0045_league_team_logos.sql` adds the
  private `league-assets` bucket, captain-only storage policies, and the
  `league_set_team_logo` RPC (12 statements parse).
- Migration `app/supabase/migrations/0046_league_team_logo_rls_fix.sql` fixes
  the upload RLS failure: paths are now
  `league/<auth.uid()>/<team_id>/logo-*`, storage policies only compare the
  uploader folder to `auth.uid()`, and `league_set_team_logo` keeps the captain
  and path-prefix checks (9 statements parse).
- Migration `app/supabase/migrations/0049_league_cancel_season.sql` adds
  `league_cancel_season`: OWNER/ADMIN can delete a DRAFT/REGISTRATION/ACTIVE
  season that has no duels; squads/fixtures cascade, members are notified and
  the action is audited (3 statements parse).
- Migration `app/supabase/migrations/0050_league_winner_badge.sql` adds
  `winner_badge_path`/`winner_team_id`/`winner_badge_awarded_at` to
  `league_seasons` plus two RPCs: `league_set_winner_badge` uploads/changes
  the badge at any season status, and `league_award_winner_badge` (once
  COMPLETED/ARCHIVED) resolves the standings winner and awards a
  `LEAGUE4V4_CHAMPION` achievement with that image to every ACTIVE squad
  member (9 statements parse).
- Migration `app/supabase/migrations/0051_league_season_rules.sql` adds
  `league_seasons.rules` (5000-char cap) and `league_set_season_rules`,
  editable by admins while DRAFT/REGISTRATION/ACTIVE (6 statements parse).
  Rules are edited in League admin and displayed on the 4vs4 hub.
- Migration `app/supabase/migrations/0052_league_fixture_generation_fix.sql`
  replaces `league_generate_fixtures` with a deterministic circle-formula
  schedule. Applied 2026-10-21; `qa/vik_4v4_smoke.mjs` now passes all 20
  checks, including first generation and reset (3 statements parse).
- Migration `app/supabase/migrations/0053_dispute_hardening.sql` hardens 1v1
  disputes: a transactional `dispute_match` RPC with state/duplicate checks,
  one OPEN/UNDER_REVIEW dispute per match, participant/staff-only read policy,
  and direct player inserts revoked. Written, syntax-validated with pglast
  (9 statements), but **not yet applied**; run it in the Supabase Dashboard.
  The client has a guarded fallback until it is applied.
- 1v1 matches in `DISPUTED` now show participants a localized "Result under
  review" card with the dispute reason/description.
- `app/supabase/FULL_SETUP.sql` updated with 0044 through 0053 bodies
  (753 statements parse).
- 4vs4 squad logos are implemented in the client: captain upload/change/remove
  on My Squad, signed-URL display on team cards, team page, match header,
  fixtures, standings and admin approvals. Typecheck, 94 tests and production
  build pass. Logo editing is hidden for rejected/withdrawn teams.
- The captain's invite list now includes every active player with a status
  label: free to join, invite pending, or already in a squad (with squad name).
  Only free players show an Invite button; pending invites have an Undo button
  (migration `0047_league_revoke_invite.sql`). The squad hero, roster and invite
  headings show the roster count as `members/roster_max` (for example `3/8`).
- Squads have a 160-character bio (migration `0048_league_team_bio.sql`).
  Captains edit it on My Squad; it appears in the squad hero, team page and
  team cards.
- Squad-approval counter now ignores REJECTED/WITHDRAWN teams (so a rejected
  squad no longer inflates `0/2`), and the Approve button shows a red reason
  when the roster is below `roster_min` (the RPC still enforces 6-8 players).
- The Arena no longer has a War Council or 4vs4 tab. 4vs4 season creation is
  now inside the competitions page's New competition form, via a Standard /
  4vs4 League toggle. The 4vs4 branch uses the shared
  `LeagueSeasonCreateForm` (also used by League admin) and opens League admin
  with the new season selected. Arena challenges now require selecting an
  existing clan member: the outside-rival input and WAR battle type were
  removed from the issue form (legacy rows still render). War Council files
  were left untouched.
- League admin always shows the Winner badge card for the selected season:
  upload/change the badge image at any time; once the season is
  COMPLETED/ARCHIVED an Award to winners button gives it to the first-place
  squad's active players, where it appears in their profile badge area
  (type `LEAGUE4V4_CHAMPION`, no template override).
- League admin hero now has a red Cancel season button (DRAFT/REGISTRATION/
  ACTIVE, refused once duels exist), and ghost buttons inside dark `.hero`
  cards force white text so they stay readable in the light theme.
- Harness `qa/vik_non4_qa.mjs` already contains the F1 patch: public tryout
  insert is now verified insert-only (no `.select('*')`) since anon has no
  SELECT policy; an admin then fetches the row by email.
- QA accounts: 26 accounts exist (aliases p01–p24, admin, staff, all
  `youssef.mouslih96+<alias>@gmail.com`). Passwords were reset 2026-10-21 and
  the account state lives in `qa/tmp/vik_full_qa_accounts.json` — that file is
  gitignored (contains the password); if missing, run
  `node qa/vik_reset_qa_passwords.mjs`, optional env var `VIK_QA_PASSWORD`.
- Migrations 0044 and 0046–0052 were applied through the Supabase Dashboard
  on 2026-10-21. Post-migration smoke checks confirm the new season columns,
  the `league-assets` bucket and all new RPCs are present. `0053` is written
  but still needs to be applied the same way.
- Non-4vs4 QA now passes 48/48. Re-ran 2026-10-21 after updating C8 to call
  `dispute_match` when present (guarded pre-0053 fallback otherwise); log:
  `qa/artifacts/vik_non4_qa_after_0053_harness.log`. Earlier harness fixes:
  A4/A10 accept the trigger's "cannot change your own role" message, E3 uses
  p13 for the join request (E2 had already invited p12), and D8 uses p05 for
  `squire` (p05 actually confirmed a match). `vik_cleanup_non4.mjs` was run
  afterwards (log `qa/artifacts/vik_non4_cleanup_after_0053_harness.log`) and
  the base throne/profiles/26 QA accounts are restored.

## UX pass (Oct 21, 2026 — latest)

- Replaced every native `confirm()` with `confirmDialog()` from
  `app/src/components/ui/confirm.ts`, rendered by the single `ConfirmHost`
  mounted in `App.tsx` (danger variant, Escape/backdrop cancel, focus restore,
  `window.confirm` fallback). Protected `SquadsTab.tsx` was not edited.
- Added a localized error catalog (`app/src/i18n/errors.ts`) wired through
  `tError()` in `LocaleContext`. It maps ~90 service validation messages plus
  common Supabase auth, RLS and duplicate-key errors to EN/FR/AR; unknown
  database messages still fall through in English. All catch/display sites now
  use `tError(error)`.
- Added `QueryError` (retry card) on Competitions, 4vs4 hub, fixtures,
  standings, stats, teams, My Squad and League Admin. `CompetitionsPage` no
  longer performs an N+1 participant-count query; `listParticipantCounts()`
  fetches all counts in one query.
- 4vs4 season history: season selectors on Hub, Fixtures, Standings, Stats and
  Teams. Hub links carry `?season=<id>`, pages fall back to the current
  season, and a past-season notice hides management actions.
- League Admin is split into Setup / Squads / Schedule / Disputes tabs. Setup
  has a four-item completion checklist (dates, rules, squads approved,
  fixtures generated), the season editor and the create-season form.
- Competition creation now shows localized type labels, Standard vs 4vs4
  explanations, inline roster-limit validation and a live preview.
- Destructive dialogs are informative: cancel season includes squad/fixture
  counts, status changes name the season, and winner-badge award names the
  first-place squad and its active-player count (fetched on confirm).
- Arena Commands now uses a clan-member select instead of free text. My Squad
  keeps the existing roster search, adds a no-results message and a copyable
  squad link.
- Verification: typecheck, 94 tests, lint (23 warnings / 0 errors) and
  production build pass.

### Design pass (competitions / league tables)

- Tournament/Cup Bracket tab is now a real horizontal bracket
  (`app/src/components/competition/BracketView.tsx`): round columns, CSS
  connectors, winner highlighting, player avatars, current-player ring,
  per-round status and a champion card. It renders the rounds that exist; the
  backend still does not create later-round matches, so the final/champion
  stays TBD until that progression work is implemented.
- League tables now keep rank + player/team columns sticky, highlight the
  signed-in player's row, mark the top three and show last-five form as W/D/L
  dots. On mobile the 1v1 table hides GF/GA and the 4vs4 table hides DW/DL/DD;
  the full columns return at `sm`. 4vs4 form is derived from completed
  fixtures in `LeagueStandingsPage`; current squad comes from
  `findMyLeagueTeam`.
- `LeagueStandingsTable` accepts optional `form` and `highlightTeamId` props;
  `StandingsTable` accepts optional `form` and `highlightPlayerId`. Shared
  dots live in `app/src/components/ui/FormDots.tsx`.
- Draft-season visibility fix: `LeagueSeasonCreateForm` now invalidates the
  `leagueKeys.seasons` cache after creating, `LeagueAdminPage` refetches on
  mount, validates the selected id against the loaded list, and keeps
  `?season=<id>` in sync. This fixes a newly created DRAFT not appearing
  until another season was created or the cache expired.
- Draft duplicate guard/resume: the Competitions 4vs4 flow and League Admin
  setup now detect DRAFT seasons and show a `LeagueDraftList` with Resume
  actions instead of the create form. `createLeagueSeason` also rejects a
  second draft. Multiple legacy drafts are all listed so they can be resumed
  and cancelled. The guard is client-side only; a DB constraint/trigger is
  still needed for absolute enforcement.
- 4vs4 dispute audit: new `qa/vik_4v4_dispute_qa.mjs` passes 6/6 against live
  Supabase. It covers participant and non-participant captain disputes,
  duplicate refusal, outsider RLS denial, evidence upload/ownership,
  mismatched-report auto-disputes, staff score resolutions, and report status
  transitions (CONFIRMED/REJECTED). Log: `qa/artifacts/vik_4v4_dispute_qa.log`.
- Still open: tournament later-round generation/advancement needs an RPC (no
  DB password locally), and Overview is still mostly static format text.
- 1v1 dispute hardening is implemented but waits on migration `0053` being
  applied. Until then the client uses the old path with added status/duplicate
  checks; the server-side guarantee and tightened SELECT policy activate only
  after the migration. 4vs4 still has no post-confirmation correction path if
  cheating is proven after a duel is CONFIRMED.

## UI/UX skills + audit (Oct 22, 2026)

- Installed seven project-level OpenCode skills under
  `.agents/skills/` and pinned them in `skills-lock.json`:
  osmontero `designing-frontend-interfaces`, `designing-user-experience`,
  `building-accessible-interfaces`, `reviewing-interface-quality`;
  Vercel `web-design-guidelines`, `vercel-react-best-practices`;
  Anthropic `webapp-testing`. No `opencode.json` is needed because
  `.agents/skills` is auto-loaded; restart OpenCode to expose them to the
  `skill` tool.
- Browser checks use a temporary Python Playwright venv with Chrome for
  Testing, not an MCP server. Baseline and after screenshots are in
  `qa/artifacts/uiux-before-*` and `qa/artifacts/uiux-after-*` (mobile 390px
  and desktop 1440px, dark/light); these PNG directories are intentionally
  untracked.
- Axe baseline found missing `h1`s, a broken skip-link target, content outside
  landmarks, low-contrast white-on-red badges, and label/content-name
  mismatches. Fixed: localized skip link with a real `#main-content` target;
  Home/Login/Profile headings; notification bell labels including unread
  counts; throne link accessible name; 44px target retained.
- Light-theme contrast pass: darker paper-mode ink for brand gold, accent red,
  green/amber/red status text, and zinc; forged-steel surfaces (`hero`,
  `rune-frame`, efoot banner, book cover) restore the bright accents. Primary
  CTA and unread badges now meet WCAG AA with white text; disabled buttons use
  a not-allowed cursor.
- Fixed the BottomNav League tab staying inactive on `/4vs4*` (also active on
  competition detail, profile on settings). Notification header is now
  two-row on mobile with a real refresh icon and compact dates; Settings shows
  push-unavailable states as status text instead of a fake disabled CTA;
  install copy no longer depends on a missing `⋮` glyph; update-banner close
  uses the icon set.
- Verification after the pass: `npm run typecheck`, 94/94 tests, oxlint
  (23 warnings / 0 errors), production build. Axe re-check at 390px in both
  themes reports 0 violations on Home, Competitions, 4vs4, Notifications and
  Settings; the other routes still need the same axe pass.

## Credentials / secrets

- Service-role key is NEVER committed. It must be present in `app/.env` as
  `SUPABASE_SERVICE_ROLE_KEY=...` both locally and on any new machine. On this
  original Mac it lives (if lost) in VS Code local history under
  `~/Library/Application Support/Code/User/History/-62736dc4/` files `8J6X`
  and `ugOQ` (old app/.env snapshots). Project ref: `qbgquikpywdmujwtchyx`.
- Only ever use `app/.env` locally. After final QA completion, remove
  `SUPABASE_SERVICE_ROLE_KEY` from `app/.env` again.

## Verified base state (post-cleanup, Oct 21 2026)

- Base profiles: `93bc533e-…` OWNER (`pride`), `bb4a6374-…` ADMIN (`Ysf`),
  `db465dfa-…` PLAYER (`mobiledev288gmailcom`), `58332316-…` PLAYER (`test`).
- Throne: 2 reigns; open reign `79674a53-…` held by `Ysf` (bb4a6374);
  prior `67b4e307-…` closed with same holder.
- Counts read live: competitions 6, participants 7, waitlist 1, challenges 16,
  xp_ledger 29, quest_claims 5, gp_requests 1, squads 0, rounds/matches 0.
- 4vs4 QA season `32b21e09-…` and child rows deleted; 8 storage objects
  removed. The live `test` season (`63fbc548-…`) was cancelled by the user
  at 17:21 via the app (audit log). `league_seasons` may now contain DRAFT
  rows created during user testing; the create flow lists and resumes them
  instead of creating duplicates.

## qa/ toolkit (paths are repo-relative; scripts are portable)

- `qa/vik_non4_qa.mjs` — main harness (48 tests, non-4vs4). Run with
  `node qa/vik_non4_qa.mjs`. Writes results to `qa/tmp/vik_non4_qa_results.json`
  and created-rows state to `qa/tmp/vik_non4_qa_state.json`.
- `qa/vik_cleanup_non4.mjs` — post-run cleanup; deletes all QA rows and any
  QA-held throne reigns, reopens base reign `79674a53-…` for holder
  `bb4a6374-…`. Needs `qa/tmp/vik_full_qa_accounts.json`.
- `qa/vik_4v4_smoke.mjs` — creates a temporary 4vs4 season with 4 squads,
  exercises rules, invites/revoke, bio, logo upload/RLS, winner badge,
  fixture generation/reset, standings and cancel, then cleans up. Latest log:
  `qa/artifacts/vik_4v4_smoke.log` (20/20).
- `qa/vik_4v4_dispute_qa.mjs` — creates a temporary active season with four
  squads, submits both lineups, then exercises participant and captain
  disputes, dispute RLS, duplicate refusal, mismatched-report auto-disputes,
  evidence upload, staff score resolution and report transitions; cleans up
  the season, child rows and uploaded evidence. Latest log:
  `qa/artifacts/vik_4v4_dispute_qa.log` (6/6).
- `qa/vik_cleanup_4v4.mjs` — deletes a QA 4vs4 season and child rows in FK
  order (season id is hardcoded `32b21e09-…`, update if new season created).
- `qa/vik_reset_qa_passwords.mjs` — resets all QA account passwords to one
  random value and writes `qa/tmp/vik_full_qa_accounts.json`.
- `qa/vik_full_qa_accounts.mjs` — (re)creates the 26 QA accounts (use when the
  accounts are missing entirely, not merely when password was lost).
- `qa/vik_base_check.mjs` / `qa/vik_final_check.mjs` — read-only state checks.
- `qa/artifacts/` — harness results (`vik_non4_qa_results_run6.json` is the
  48/48 pass, `vik_4v4_smoke.log` is the 20/20 smoke,
  `vik_4v4_dispute_qa.log` is the 6/6 dispute pass), created-rows state, and
  earlier run logs for reference.

## Bugs fixed in 0044 (summary)

- B4: `guard_profile_update` rewritten — no direct OWNER role changes
  (must use `transfer_ownership`, which now sets a GUC
  `vik.owner_transfer` guard); only OWNER can manage ADMIN roles; no
  self role/status changes. `transfer_ownership` rewritten accordingly.
- D3: new policy "open calls first taker" on `challenges` (update by
  authenticated, checks open unexpired call → ACCEPTED + self opponent).
- D10: `guard_challenge_update` now allows the outgoing throne holder
  (`OLD.opponent_id = me`) to redirect a pending/accepted pledge to the
  current holder without touching scores/evidence.
- E2/E3: new policies "leaders invite squad members" (insert) and "leaders
  answer squad invites" (update) on `squad_members`; `guard_squad_member_update`
  rewritten to allow leader to accept/decline PENDING rows; protected War
  Council files (`0013_squads.sql`, `squadService.ts`, `SquadsTab.tsx`) untouched.
- F1: "anon submit tryout" policy recreated and
  `grant insert on public.tryout_requests to anon, authenticated`.

## Next move (on any machine)

1. Migrations `0044` and `0046`–`0052` are applied; non-4vs4 QA is 48/48,
   the 4vs4 smoke is 20/20 and the UX pass is implemented. Apply `0053` next,
   then re-run the non-4vs4 QA (C8 now uses `dispute_match` when present).
2. Manual browser QA: confirm dialogs, localized errors, retry cards, season
   history, Admin tabs/checklist, competition preview/validation, Commands
   member select, the copyable squad link, the new competition bracket,
   sticky/form league tables and the draft-season resume guard.
3. Re-run `node qa/vik_4v4_smoke.mjs` after browser QA if any season data was
   created manually, and clean up.
4. Commit/push the 4vs4 + UX work.
5. Remove `SUPABASE_SERVICE_ROLE_KEY` from `app/.env` and delete
   `qa/tmp/vik_full_qa_accounts.json` after the final pass.

## Known open items (4vs4 / broader)

- Fixture-generation 409 is fixed by `0052` and covered by
  `qa/vik_4v4_smoke.mjs` (first generation + reset).
- 4vs4 Phase 8 Part B manual browser QA deferred (now includes the UX pass).
- Tournament progression is incomplete server-side: `confirm_match` closes
  and unlocks rounds but never creates the next round's matches, so only
  Round 1 exists after cup generation. The new bracket shows this honestly
  (later columns stay TBD). Needs a migration/RPC before cups can finish.
- 4vs4 single-DRAFT enforcement is client-side (`createLeagueSeason` pre-check
  + UI guard). Add a partial unique index or RPC check in a future migration;
  existing duplicate drafts must be cleaned up first.
- 4vs4 has no app-side post-confirmation correction: staff cannot reopen a
  CONFIRMED duel or reverse its fixture/standings if cheating is proven later.
- App code fix candidates (not yet applied): `challengeService.acceptOpenBattle`
  could use insert-less `.select('id')` feedback; `tryoutService` is already
  insert-only.
