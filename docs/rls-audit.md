# VIK Clan RLS Audit — anon-key cheat paths (migrations 0001–0033)

Date: 2026-10-16 · Branch: `features` · Scope: every path where a logged-in
user armed with only the public anon key + their own JWT can cheat.
Method: read all policies in `app/supabase/migrations/0001–0033` and every
client write in `app/src/services/*` + `useOath` + `authStore`.

Severity: **CRITICAL** = free wins / free Glory / privilege escalation.
**MEDIUM** = fraud/griefing without economy impact. **LOW** = spam/quota noise.

## 1. Per-table matrix (who can INSERT / UPDATE / DELETE)

Legend: Anon = logged-out key · Member = any authenticated PLAYER ·
Mod = MODERATOR · Staff = OWNER/ADMIN (or wider where noted). R = read.

| Table | Anon | Member INSERT | Member UPDATE | Member DELETE | Staff write |
|---|---|---|---|---|---|
| profiles | I only as PLAYER/ACTIVE (0004) | **U own row, ANY column (F1)** | — | OWNER/ADMIN ALL | OWNER/ADMIN ALL |
| clan_settings | R (0027, login toggle) | — | — | OWNER/ADMIN ALL | OWNER/ADMIN ALL |
| competitions | — | — | — | OWNER/ADMIN ALL | OWNER/ADMIN ALL |
| competition_participants | — | I own row (no ACTIVE/oath/capacity check, F2) | — (staff only) | D own row | O/A/M ALL |
| competition_waitlist | — | I own row, **position self-chosen** (F2) | — (staff only) | D own row | O/A ALL |
| rounds | — | — | — | O/A/M ALL (0033) | O/A/M ALL |
| matches | — | — | **U own matches, ANY column incl. status=CONFIRMED (F3)** | O/A/M ALL | O/A/M ALL |
| match_evidence | — | I any match (F-spam) | — (staff only) | O/A/M ALL | O/A/M ALL |
| disputes | — | I any match (F-spam) | — (staff only) | O/A/M ALL | O/A/M ALL |
| announcements | — | — | — | O/A ALL | O/A ALL |
| notifications | — | **I to ANY user, any text (F4)** | U own (mark read) | — (none) | none (open insert covers) |
| achievements | — | — (staff only; auto-awards dead, see §3) | — | O/A ALL | O/A ALL |
| audit_logs | — | **I any actor/action (F6)** | — | O/A read only | O/A read only |
| challenges | — | I as challenger | **U as participant, ANY column (F5)** | O/A/M ALL | O/A/M ALL |
| throne_reigns | — | — (staff only; auto-settle dead for players, see §3) | — | O/A ALL | O/A ALL |
| xp_ledger | — | **I self, ANY amount/reason (F7)** | — | — (none) | none |
| quest_claims | — | **I self, ANY quest (F8)** | — | — (none) | none |
| ratings | — | I as rater (table blocks self-rate) | **U own, can reassign rater_id (F9)** | — (none) | none |
| squads | — | I as leader | **U own-led, can transfer leadership (F10)** | O/A/M ALL | O/A/M ALL |
| squad_members | — | I own row (breaks leader invites, §3) | **U own, can self-promote LEADER (F10)** | O/A/M ALL | O/A/M ALL |
| push_subscriptions | — | ALL own rows only | own only | own only | — (owner-scoped, OK) |
| gp_requests | — | I as requester (5–500 checked) | **U as giver OR requester, can ACCEPT free (F11)** | O/A/M ALL | O/A/M ALL |
| tryout_requests | I PENDING-only (authed role excluded, §3) | — | **tester: U own tasks, ANY column incl. status=ACCEPTED (F12)** | O/A ALL | O/A ALL |
| storage avatars | — | **ALL any path: overwrite/delete ANY avatar (F13)** | any path | any path | — |
| storage match-evidence | — | I any path (quota spam, LOW) | — (none) | — (none) | — |
| storage clan-assets | — | — | — | O/A ALL | O/A ALL |

Staff = OWNER/ADMIN unless noted (O/A/M = +MODERATOR).

## 2. Findings → fix (migration 0034)

- **F1 CRITICAL — profile privilege escalation.** `users update own profile`
  is `FOR UPDATE USING (id = auth.uid())` with no `WITH CHECK`: any member can
  `UPDATE profiles SET role='OWNER'` on their own row. Fix: `BEFORE UPDATE`
  trigger freezes `role/status/username/email` for non-staff. Self-writes that
  keep working: `updateOwnProfile` allow-list, `swear()` (`oath_accepted_at`),
  heartbeat (`last_login_at`).
- **F2 MEDIUM — join/waitlist bypass.** Self-join has no ACTIVE/oath check
  (SUSPENDED members, oath-skippers join via API) and waitlist `position` is
  client-chosen (queue jumping). Capacity is still client-checked (race).
  Fix: `WITH CHECK` ACTIVE + oath-sworn on both self-inserts; trigger forces
  `position = max+1`. Later task: atomic capacity RPC (`join_competition_rpc`).
- **F3 CRITICAL — match self-confirm.** Participant UPDATE has no column guard:
  set `status='CONFIRMED'`, arbitrary scores, `winner_id`, `confirmed_by`.
  Fix: state-machine trigger for non-staff (submit / opponent-confirm /
  dispute / forfeit-claim / deadline-gated overdue only; `winner_id` recomputed;
  `player_a/b` immutable) + `WITH CHECK` mirror. New gated policies preserve
  flows for non-participant viewers: anyone may flip expired → OVERDUE.
- **F4 MEDIUM — notification spoof.** Open INSERT lets anyone message anyone
  (fake admin notices). Kept temporarily (TODO in migration): central
  `notify()` is used by every flow. Later task: per-event validated
  `send_notification` RPC.
- **F5 CRITICAL — battle self-complete.** Participant UPDATE unguarded:
  jump to COMPLETED with fantasy scores, decline forced calls, tamper
  `type/forced/for_throne`, forge throne transfers. Fix: insert trigger
  (forced needs 100 GP balance, one active throne pledge, open-call expiry
  forced) + update state-machine trigger. New gated policy preserves the
  ghost sweep (anyone may cancel expired open calls).
- **F6 MEDIUM — audit forgery.** Anyone can append as any actor. Fix: `WITH
  CHECK (actor_id = auth.uid())` — all call sites already use self (verified).
- **F7 CRITICAL — infinite Glory mint.** `members earn xp` allows any
  amount/reason for self. Fix: DROP direct INSERT; new `SECURITY DEFINER`
  RPCs `grant_match_rewards / grant_battle_rewards / claim_quest /
  answer_gift / claim_onboarding_reward`. Client switches: `matchService`,
  `challengeService`, `sagaService`, `OnboardingGate`. `awardXP` kept as
  deprecated (no direct-DB replacement; RPCs only).
- **F8 HIGH — quest fraud.** Direct `quest_claims` INSERT claims any quest
  uncompleted. Fix: DROP direct INSERT; `claim_quest` RPC re-validates the 6
  quests in SQL (Africa/Casablanca day/Monday boundaries).
- **F9 MEDIUM — rating takeover + score spoof.** Update can reassign
  `rater_id`; `score` need not match dims. Fix: `WITH CHECK (rater=self)` +
  table CHECK pinning `score` to the dims average when dims present.
- **F10 MEDIUM — squad theft / self-promote.** Leader UPDATE can transfer
  `leader_id`; member UPDATE can set `role='LEADER'`. Fix: `WITH CHECK
  (leader=self)` on squads + trigger freezing `player_id/role` (status
  PENDING→ACCEPTED/DECLINED only) on squad_members.
- **F11 HIGH — free Glory gifts.** Giver/requester UPDATE can set ACCEPTED
  with no ledger movement (giver accepts without paying; requester
  self-accepts). Fix: DROP member UPDATE; `answer_gift` RPC does
  balance-checked paired ledger transfer. `askGift` direct INSERT stays (safe:
  creates a request only; amount 5–500 table-checked).
- **F12 HIGH — tester accepts tryouts.** `tester reports verdict` UPDATE has
  no column guard: assigned tester can set `status='ACCEPTED'`, reassign tasks,
  write `admin_note`. Fix: trigger freezing everything but
  `verdict*/updated_at` for non-staff.
- **F13 MEDIUM — avatar griefing.** One `FOR ALL` storage policy keyed only on
  bucket: anyone can overwrite/delete anyone's avatar. Fix: keep SELECT for
  all authenticated; scope INSERT/UPDATE/DELETE to own folder
  (`foldername(name)[1] = auth.uid()`).
- **match_evidence / disputes spam (LOW).** Rows could target any match. Fix:
  participation-scoped `WITH CHECK` (staff covered by staff policies).
- **Storage match-evidence uploads (LOW, quota).** Any-path INSERT stays
  (TODO): path ↔ match linkage can't fail closed without risking legit
  uploads; the `match_evidence` row gate above is the meaningful check. Later
  task: signed-upload-URL RPC.

## 3. Pre-existing breaks found (fail-closed, fixed or queued)

- Throne auto-settle as PLAYER fails RLS today (silently skipped) → fixed by
  `settle_throne_battle` RPC (replicates the uncommitted pledge-retarget work
  on `features`: PENDING/ACCEPTED pledges follow the throne).
- FIRST_BLOOD + STREAK_5/10 auto-awards fail RLS for players (silently dead) →
  revived inside `grant_match_rewards` (same names/reasons/notices as client).
- Squad invites by non-staff leaders fail RLS (member rows for invitees) →
  NOT fixed (needs data-preserving design choice); queued as later task
  `create_squad_with_invites` RPC, TODO-marked. Staff leaders unaffected.
- `markOverdue` / ghost sweep only worked when a participant/staff viewed →
  fixed by the two gated policies above (now any viewer advances them).
- `submitTryout` as a logged-in user fails (policy is `to anon` only) →
  widened to `anon, authenticated` with the same PENDING check (no new hole).
- Resubmit evidence cleanup as submitter fails silently (no member DELETE) →
  unchanged; round-purge + 24h sweep cover it. Queued: scoped storage DELETE
  (risky, later).

## 4. Later RPC tasks (in order)

1. `send_notification` per-event RPC (replace open INSERT, F4).
2. `join_competition_rpc` (atomic capacity + waitlist promote, F2 remainder).
3. `create_squad_with_invites` RPC (squad invites for non-staff leaders).
4. Signed upload URLs for match-evidence (quota hardening).
5. `submit_match_result_rpc` / `submit_battle_result_rpc` (move the remaining
   client UPDATEs behind validation; triggers already enforce the machine).

## 5. Deploy / run manually

1. Run `app/supabase/migrations/0034_rls_cheat_lockdown.sql` in Supabase SQL
   editor (idempotent; re-runnable). It is also appended to
   `app/supabase/FULL_SETUP.sql` for fresh installs.
2. No storage/secret changes. No Edge deploy.
3. Verify: `app/supabase/tests/0034_rls_tests.sql` — Part A runs in SQL editor
   (all assertions must pass); Part B is the manual JWT cheat checklist.
4. Client + migration must ship together (client now calls the new RPCs).

Acceptance: this report exists · migration idempotent (all
`DROP ... IF EXISTS` / `CREATE OR REPLACE`) · tests listed in §5 + tests file.
No i18n keys added (no new UI copy; RPC errors reuse the exact client strings,
e.g. `Quest not complete yet.`). No Vitest additions (no pure TS logic
changed; coverage is the SQL test script).
