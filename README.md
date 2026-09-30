# theLastVikingClan — VIK Clan PWA

Private eFootball Mobile clan management & competition platform for **The Last Viking** (`VIK`).
One clan, one living Norse kingdom: leagues, cups, battles, throne, saga progression, clan code — as an installable mobile-first PWA in **English, French and Arabic (RTL)**.

Live loop: **next match → deadline → play → submit + screenshot → opponent confirms → standings update.**

> Local-only workflow: changes are committed locally and pushed to GitHub/Netlify **only on your word** (Netlify builds cost free-tier credits).

## The clan

- **Identity:** Norse-inspired competitive brotherhood — honor, loyalty, discipline, legacy. Emblem in `app/public/logo.png`.
- **Clan Code** (`/code`): 9 Laws (Honor → Legacy), the Viking's Oath (sworn once, timestamped, **required before joining**), the Legacy (Hall of Fame), war-words commands.
- **Battles** (`/battles`, nav: Arena): Calls for a Head — **regular** (refusable) or **unrefusable 100 GP must-answer** (needs 100 GP balance, winner takes +100 bounty); Friendly Duels incl. **open mat** (clan-wide alert, first to accept plays); Honor Duels incl. **throne challenges**; Blood-Debt rematches; War Council **3v3/4v4 squads** (leader invites + member requests, both sides accept); submit → confirm flow; shareable 1080px battle posters (WhatsApp-ready).
- **King's Throne**: champion card on Home (reign, defenses, history), challenge-for-throne pledge, auto-transfer on lost title battle (+1 defense on hold), admin crowning/vacating, full reign log.
- **Saga progression** (`/saga`): Glory XP (verified matches, quests, bounties, gifts), 8 Norse levels (Outsider→Legend), daily/weekly quest board with **period-locked claims** (no double-pay), seasonal leaderboard, win-streak badges (x5/x10), First Blood, peer ratings (tactical/fair-play/connection + title tags), GP gift favors (ask/accept, real ledger transfers).
- **Competitions**: leagues (round-robin), cups/tournaments (knockout 4/8/16), join codes/links, capacity + deadlines enforced, waitlist only when FULL, auto open→close→finish lifecycle with manual override + reopen, standings from CONFIRMED only, player replacement (future fixtures only, history kept).
- **Trust & safety**: mandatory screenshot proof, fair-play checklist, dispute reports (score/no-show/wrong opponent/screenshot/no clan tag/misconduct/cheating) → admin queue with audit log; RLS on every table; soft-delete with **two-person rule** for started competitions (requester can never self-approve; restorable, never hard-deleted).
- **Profiles**: eFootball card (avatar tap-to-change, custom banner color/image, PvP division, W/D/L bar, last-5 vs opponents, honors, streaks, ratings), socials (IG/TikTok/Kick/WhatsApp chat button), share-as-image posters, member management (roles/status, owner-only guards).

## Roles & permissions

| Role | Can |
|---|---|
| OWNER | Everything: grant/revoke Admin & Owner, remove members, clan settings, approve deletions, crown, audit. Last active owner can't be demoted. |
| ADMIN | Create/edit competitions, fixtures, registration, disputes queue, replacements, announcements, honours, throne crown; manage members up to Moderator. |
| MODERATOR | Set results / forfeits on match pages, resolve disputes there. No Admin dashboard. |
| PLAYER | View, join (after oath), submit/confirm/dispute, challenges, quests, gifts, rate peers, edit own profile. |

## Tech

- **App** (`app/`): React 19 + TypeScript + Vite, Tailwind v4, React Router, TanStack Query, Zustand, Supabase JS, vite-plugin-pwa, Vitest (23 tests).
- **Backend**: Supabase Postgres + Auth + Storage + Realtime. No custom server. Pure logic lives in `src/competition/` (unit-tested); DB calls live in `src/services/`.
- **Design**: Valhalla Gold + Runic Steel, dark-first with light/dark/system setting; Cinzel display + Chakra Petch body; SVG icon set; safe-area + standalone PWA; install guide (native prompt / iOS Share steps); reduced-motion respected.
- **i18n**: `src/i18n/dictionaries.ts` (en/fr/ar, identical key sets enforced by `Dict = typeof en`), RTL via `document.dir`, locale dates.

## Setup

```bash
cd app
cp .env.example .env   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (+ VITE_VAPID_PUBLIC_KEY later)
npm install
npm run dev    # http://127.0.0.1:5173
npm test       # vitest run (23)
npm run build  # tsc + vite + PWA precache
```

Run migrations **in order** in Supabase SQL editor (`app/supabase/migrations/`):

| File | What |
|---|---|
| 0001_initial_schema.sql | All core tables, constraints, base RLS |
| 0002_phase7_policies.sql | Join/leave, evidence, notifications, audit, storage, realtime |
| 0003_soft_delete.sql | `is_deleted` + two-person delete columns + read policy |
| 0004_public_signup.sql | Public PLAYER/ACTIVE profile insert (no escalation) |
| 0005_profile_efootball.sql | Divisions, favourite player, avatar path |
| 0006_oath.sql | `oath_accepted_at` |
| 0007_challenges.sql | Battles table + RLS |
| 0008_throne.sql | Reigns table + `for_throne` flag |
| 0009_saga.sql | `xp_ledger` (idempotent refs) + `quest_claims` (period lock) |
| 0010_forced_calls.sql | `forced` flag on challenges |
| 0011_ratings_banners.sql | `ratings` table + banner columns |
| 0012_ratings_v2.sql | 3-dimension ratings + title tags |
| 0013_squads.sql | Squads + squad members + RLS |
| 0014_push_subs.sql | Push subscription storage (**sender pending**) |
| 0015_socials.sql | Instagram/TikTok/Kick columns |
| 0016_gifts.sql | Negative ledger rows + `gp_requests` |
| 0017_open_mat.sql | `is_open` flag on challenges |
| 0018_whatsapp.sql | WhatsApp number column |

Then: create private buckets `avatars`, `clan-assets`, `match-evidence`; first user via Auth (auto-confirm) + `profiles` row `OWNER`/`ACTIVE`; disable **Confirm sign up** email while testing; confirm existing users via SQL if needed.

## Deploy (Netlify)

- Base `app`, build `npm run build`, publish `dist`; env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- `netlify.toml` omits those two public keys from secrets scanning (anon key is public by design; RLS protects data).
- SPA fallback via `app/public/_redirects`; icons from `scripts/gen-icons.mjs` + `public/logo.png`.
- Push only on command. To save credits: Site configuration → Build & deploy → pause auto-publishing.

## Repo layout

```
app/
  public/          logo.png, coin.png (add yours), PWA icons, _redirects
  scripts/         gen-icons.mjs
  src/
    app/           router, providers (Query + auth init + realtime binder)
    competition/   pure engines + tests (league/knockout/standings/deadline/replacement/joinCode)
    components/    ui (Icon/Avatar/AppBar/BottomNav/StatusBadge/CopyButton/CoinImg/InstallPrompt), battle, competition, match, player, clan, admin
    pages/         Home, Login, Competitions, CompetitionDetail, Match, Join, Clan, Player, Profile, Settings, Code, Battles, Saga, Admin, Notifications
    services/      auth/player/clan/competition/match/standings/dispute/replacement/statistics/rating/announcement/notification/honour/throne/challenge/squad/saga/storage/push
    stores/        authStore (zustand)   hooks/ useOath, useRealtime
    i18n/          dictionaries + LocaleContext (t(), fmtDate(), statusLabel())
    utils/         shareBattle (canvas posters), theme.tsx (dark/light/system)
  supabase/migrations/  0001–0018
```

## Conventions

- DB is source of truth; client countdowns informational; capacity/deadlines re-validated service-side.
- Only CONFIRMED/FORFEIT results affect standings/stats/streaks/XP.
- Notifications + non-critical writes are fire-and-forget (never break core flows).
- XP/claims/gifts idempotent (unique refs, period locks, balance checks) — safe to retry.
- Never expose service-role keys; anon key is public; `.env` gitignored.

## Security note

`.env.example` holds placeholders only. Real keys were once committed and purged via history rewrite + rotation — if it happens again: replace file, rewrite history or rotate keys, update Netlify env + local `.env`.

## Roadmap (deferred, needs decisions/infra)

- Edge Functions: atomic joins/results, push sender (VAPID), deadline cron.
- Team cups 4v4/3v3 brackets from War Council squads.
- Clan-wide expedition missions, cosmetics, season entity, Great Hall feed.
