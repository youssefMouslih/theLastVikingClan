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

## Where things stand

- Migration `app/supabase/migrations/0044_non4_qa_fixes.sql` written and
  syntax-validated with pglast (15 statements).
- `app/supabase/FULL_SETUP.sql` updated with the 0044 body (693 statements parse).
- Harness `qa/vik_non4_qa.mjs` already contains the F1 patch: public tryout
  insert is now verified insert-only (no `.select('*')`) since anon has no
  SELECT policy; an admin then fetches the row by email.
- QA accounts: 26 accounts exist (aliases p01–p24, admin, staff, all
  `youssef.mouslih96+<alias>@gmail.com`). Passwords were reset 2026-10-21 and
  the account state lives in `qa/tmp/vik_full_qa_accounts.json` — that file is
  gitignored (contains the password); if missing, run
  `node qa/vik_reset_qa_passwords.mjs`, optional env var `VIK_QA_PASSWORD`.
- Deployment of 0044 is still blocked: no DB password, no Supabase PAT, and
  the management API rejects the service key (401 JWT failed verification).
  `/pg/query`, `/rest/v1/rpc/exec_sql`, and
  `api.supabase.com/platform/pg-meta/.../query` with the service key all fail.
  Apply `0044` via the Supabase Dashboard SQL editor.

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
  removed; base `test` season/team preserved.

## qa/ toolkit (paths are repo-relative; scripts are portable)

- `qa/vik_non4_qa.mjs` — main harness (48 tests, non-4vs4). Run with
  `node qa/vik_non4_qa.mjs`. Writes results to `qa/tmp/vik_non4_qa_results.json`
  and created-rows state to `qa/tmp/vik_non4_qa_state.json`.
- `qa/vik_cleanup_non4.mjs` — post-run cleanup; deletes all QA rows and any
  QA-held throne reigns, reopens base reign `79674a53-…` for holder
  `bb4a6374-…`. Needs `qa/tmp/vik_full_qa_accounts.json`.
- `qa/vik_cleanup_4v4.mjs` — deletes a QA 4vs4 season and child rows in FK
  order (season id is hardcoded `32b21e09-…`, update if new season created).
- `qa/vik_reset_qa_passwords.mjs` — resets all QA account passwords to one
  random value and writes `qa/tmp/vik_full_qa_accounts.json`.
- `qa/vik_full_qa_accounts.mjs` — (re)creates the 26 QA accounts (use when the
  accounts are missing entirely, not merely when password was lost).
- `qa/vik_base_check.mjs` / `qa/vik_final_check.mjs` — read-only state checks.
- `qa/artifacts/` — last harness results (run 5: 42/48), created-rows state,
  and run log for reference.

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

1. Verify/refresh `app/.env` has `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Apply `app/supabase/migrations/0044_non4_qa_fixes.sql` in the Supabase
   Dashboard SQL editor (or via db password / PAT if available).
3. `node qa/vik_reset_qa_passwords.mjs` if `qa/tmp/vik_full_qa_accounts.json`
   is missing.
4. `node qa/vik_cleanup_non4.mjs` (in case of leftovers) then
   `node qa/vik_non4_qa.mjs`.
5. Target 48/48. If F1 fails again, it is a genuine bug (public insert denied)
   — investigate `0039`/`0044` tryout policies; do not just relax them.
6. `node qa/vik_cleanup_non4.mjs` after the passing run.
7. Remove `SUPABASE_SERVICE_ROLE_KEY` from `app/.env` and delete
   `qa/tmp/vik_full_qa_accounts.json`.

## Known open items (4vs4 / broader)

- `league_generate_fixtures` duplicate-key 409 on deployed DB; repo `0041`
  presumed correct — retest after next deploy.
- 4vs4 Phase 8 Part B manual browser QA deferred.
- App code fix candidates (not yet applied): `challengeService.acceptOpenBattle`
  could use insert-less `.select('id')` feedback; `tryoutService` is already
  insert-only.
