# theLastVikingClan — VIK Clan PWA

Private eFootball Mobile clan management & competition platform for **The Last Viking** (`VIK`).
One clan, one community: leagues, cups, battles, throne, saga progression, history — as an installable mobile-first PWA in English, French and Arabic (RTL).

Live loop: **next match → deadline → play → submit + screenshot → opponent confirms → standings update.**

## The clan

- **Identity:** Norse-inspired competitive brotherhood — honor, loyalty, discipline, legacy.
- **Clan Code** (in-app `/code`): 9 Laws (Honor, Unity, Loyalty, Perseverance, Discipline, Growth, Respect, Merit, Legacy), the Viking's Oath (sworn at joining, timestamped), the Legacy (Hall of Fame).
- **Battle Code** (`/battles`): Calls for a Head (regular voluntary / unrefusable 100 GP must-answer), Friendly Duels, Honor Duels, Blood-Debt rematches, War Council squads, open mat, shareable battle posters.
- **King's Throne**: reigning champion on Home, defenses counted, throne transfers on lost title battles, full reign history, admin crowning.
- **Saga progression**: Glory XP (verified matches, quests, bounties, gifts), 8 Norse levels (Outsider→Legend), daily/weekly quests with anti-double-claim, seasonal leaderboard, win-streak badges, peer ratings, GP gift favors.

## Roles & permissions

| Role | Can |
|---|---|
| OWNER | Everything: grant/revoke Admin & Owner, remove members, clan settings, approve deletions, crown, audit |
| ADMIN | Create/edit competitions, fixtures, disputes queue, replacements, announcements, honours, throne crown; manage members up to Moderator |
| MODERATOR | Set results / forfeits on match pages, resolve disputes there |
| PLAYER | View, join, submit/confirm/dispute own matches, challenges, quests, edit own profile |

Guards: nobody edits themselves; Admin/Owner grants and removals are owner-only; the last active owner can't be demoted; deletion of a *started* competition needs a **second, different** admin; deletions are **soft** (flagged, hidden from players, restorable, never removed from DB).

## Key flows

- **Join competition**: code/link → swear oath (once) → capacity + deadline enforced → waitlist only when FULL.
- **Match**: submit score + **mandatory screenshot** + fair-play checklist → opponent confirms/disputes → standings recompute from CONFIRMED only → Glory + streak badges auto-awarded.
- **Disputes**: player reports (score, no-show, wrong opponent, screenshot, no clan tag, misconduct, cheating) → admin queue → accept/change/forfeit/reject, all audit-logged.
- **Registration lifecycle**: auto DRAFT→OPEN→CLOSED on deadlines, ACTIVE→FINISHED on end date when clean, overdue detection on view; admin can reopen (deadline auto-extended if past).
- **Replacement**: future SCHEDULED fixtures transfer; history preserved; clan membership untouched.

## Tech

- **App** (`app/`): React 19 + TypeScript + Vite, Tailwind v4, React Router, TanStack Query, Zustand, Supabase JS, vite-plugin-pwa, Vitest (23 tests).
- **Backend**: Supabase Postgres + Auth + Storage + Realtime. No custom server; sensitive ops move to Edge Functions before public launch.
- **Design**: Valhalla Gold + Runic Steel dark-first theme (light/dark/system), Cinzel display + Chakra Petch body, SVG icon set (no emoji icons), safe-area + standalone PWA, `prefers-reduced-motion` respected.
- **i18n**: `src/i18n/dictionaries.ts` (en/fr/ar), RTL via `document.dir`, locale dates, per-locale dictionaries must share identical keys (`Dict = typeof en`).

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
| 0001_initial_schema.sql | All tables, constraints, base RLS |
| 0002_phase7_policies.sql | Join/leave, evidence, notifications, audit, storage, realtime |
| 0003_soft_delete.sql | `is_deleted` + two-person delete columns, read policy |
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
| 0014_push_subs.sql | Push subscription storage (sender pending) |
| 0015_socials.sql | Instagram/TikTok/Kick columns |
| 0016_gifts.sql | Negative ledger rows + `gp_requests` |
| 0017_open_mat.sql | `is_open` flag on challenges |

Then: create private buckets `avatars`, `clan-assets`, `match-evidence`; create first user in Auth (auto-confirm) + `profiles` row with `OWNER`/`ACTIVE`.

## Deploy (Netlify, free-tier friendly)

- Base `app`, build `npm run build`, publish `dist`; env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- `netlify.toml` omits those two public keys from secrets scanning (anon key is public by design; RLS protects data).
- SPA fallback via `app/public/_redirects`; PWA icons generated by `scripts/gen-icons.mjs` from `public/logo.png`.
- Push only when told — every push costs a build.

## Repo layout

```
app/
  public/          logo.png, PWA icons, _redirects
  scripts/         gen-icons.mjs
  src/
    app/           router, providers (Query + auth init + realtime binder)
    competition/   pure engines (league/knockout/standings/deadline/replacement/joinCode) + tests
    components/    ui (Icon/Avatar/BottomNav/AppBar/StatusBadge/CopyButton/CoinImg/InstallPrompt), competition, match, player, clan, admin, battle
    pages/         Home, Login, Competitions, CompetitionDetail, Match, Join, Clan, Player, Profile, Settings, Code, Battles, Saga, Admin, Notifications
    services/      one file per domain, never called from components directly… (components use them via pages; DB calls live here)
    stores/        authStore (zustand)
    hooks/         useOath, useRealtime
    i18n/          dictionaries + LocaleContext (t(), fmtDate(), statusLabel())
    utils/         shareBattle (canvas posters), theme.tsx (dark/light/system)
  supabase/migrations/  0001–0017
```

## Conventions

- DB is source of truth; client countdowns informational; capacity/deadlines re-validated service-side.
- Only CONFIRMED/FORFEIT results affect standings/stats/streaks.
- Notifications are fire-and-forget (`notify()` never breaks core flows).
- XP/claims are idempotent (unique refs, period locks) — safe to retry.
- Never expose service-role keys; anon key is public; `.env` is gitignored (see `SECURITY` note below).

## Security note

`.env.example` holds placeholders only. Real keys were once committed and purged via history rewrite + key rotation — if you ever leak again: replace file, `git` history rewrite or rotate, update Netlify env + local `.env`.

## Roadmap (deferred)

- Edge Functions for atomic joins/results/replacements + push sender (VAPID) + deadline cron.
- Team cups 4v4/3v3 brackets from War Council squads.
- Clan-wide expedition missions, cosmetics, season entity, Great Hall feed.
