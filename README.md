# theLastVikingClan — VIK Clan PWA

Private eFootball Mobile clan management & competition platform for **The Last Viking** (`VIK`).
One clan, one living Norse kingdom: leagues, cups, battles, throne, saga progression, clan code — as an installable mobile-first PWA in **English, French and Arabic (RTL)**.

Live loop: **next match → deadline → play → submit + screenshot → opponent confirms → standings update.**

> Local-only workflow: changes are committed locally and pushed to GitHub/Netlify **only on your word** (Netlify builds cost free-tier credits).

## The clan

- **Identity:** Norse-inspired competitive brotherhood — honor, loyalty, discipline, legacy. Emblem in `app/public/logo.png` (also favicon, PWA + iOS icons, headers, share posters).
- **Clan Code** (`/code`): 9 Laws (Honor → Legacy), the Viking's Oath (sworn once, timestamped, **required before joining**), the Legacy (Hall of Fame), war-words commands with copy buttons.
- **Battles** (`/battles`, nav: Arena): Calls for a Head — **regular** (refusable) or **unrefusable 100 GP must-answer** (needs 100 GP balance, winner takes +100 bounty); Friendly Duels incl. **open mat** (clan-wide alert, first to accept plays, callers see their own call); Honor Duels incl. **throne challenges**; Blood-Debt rematches; result needs **mandatory screenshot** (shown inline, tap to enlarge); War Council **3v3/4v4 squads** (leader invites + member requests, both sides accept); shareable 1080px battle posters (WhatsApp-ready).
- **King's Throne**: champion card on Home (reign, defenses, history), challenge-for-throne pledge, auto-transfer on lost title battle (+1 defense on hold), admin crowning/vacating, full reign log.
- **Saga progression** (`/saga`): Glory XP (verified matches, quests, bounties, gifts), 8 Norse levels (Outsider→Legend), daily/weekly quest board with **period-locked claims** (no double-pay), seasonal leaderboard, win-streak badges (x5/x10), First Blood, peer ratings (tactical/fair-play/connection + title tags), GP gift favors (ask/accept, real ledger transfers).
- **Competitions**: leagues (round-robin, everyone-plays-everyone), cups (knockout, lose once), tournaments (bracket event), special events (custom rules) — each explained in-app at creation and on Overview. Join codes/links with one-tap copy, capacity + deadlines enforced, waitlist only when FULL, auto open→close→finish lifecycle with manual override + reopen, standings from CONFIRMED only, player replacement (future fixtures only, history kept). Fixture rows carry a **message-opponent button** (WhatsApp direct when they shared a number, prefilled challenge text otherwise).
- **Matches**: submit score + **mandatory screenshot** + fair-play checklist + optional note and issue reports (auto-file disputes) → opponent sees **Confirm + Wrong?** side by side with submitter name and zoomable proof → moderator **review card** (score, proof, who/when, confirm-set/forfeit/**send-back with comment**) → standings recompute from CONFIRMED only → Glory + streak badges auto-awarded. Evidence of fully-decided rounds is purged (Free storage button + auto on Finish); replaced avatars/banners/evidence files are deleted, never orphaned.
- **Trust & safety**: dispute reports (score, no-show, wrong opponent, screenshot, no clan tag, misconduct, cheating) → admin queue with audit log; RLS on every table; soft-delete with **two-person rule** for started competitions (requester can never self-approve; restorable, never hard-deleted).
- **Profiles**: eFootball card (tap photo to change it, custom banner color/image, socials IG/TikTok/Kick, WhatsApp chat button, PvP division, W/D/L bar, last-5 as horizontal cards with opponent/score/type, honors, streaks, ratings), share-as-image posters, member management (roles/status, owner-only guards).
- **Community**: announcements (publish → all members notified), notification center with deep links (match/competition/battle/home), realtime + focus-refetch + manual refresh, Home action center for pending answers, PWA install guide (native prompt / iOS Share steps), push subscriptions ready (sender = Edge Function, VAPID keys issued).

## Roles & permissions

| Role | Can |
|---|---|
| OWNER | Everything: grant/revoke Admin & Owner, remove members, clan settings, approve deletions, crown, audit. Last active owner can't be demoted. |
| ADMIN | Create/edit competitions, fixtures, registration, disputes queue, replacements, announcements, honours, throne crown; manage members up to Moderator. |
| MODERATOR | Review card on submitted results (confirm/set/forfeit/send-back), resolve disputes. No Admin dashboard. |
| PLAYER | View, join (after oath), submit/confirm/dispute, challenges, quests, gifts, rate peers, edit own profile. |

## Tech

- **App** (`app/`): React 19 + TypeScript + Vite, Tailwind v4, React Router, TanStack Query, Zustand, Supabase JS, vite-plugin-pwa (injectManifest custom SW with push display + tap-to-open), Vitest (23 tests).
- **Backend**: Supabase Postgres + Auth + Storage + Realtime + Edge Function `send-push` (Web Push via VAPID; notify() fans out best-effort). No custom server otherwise.
- **Design**: Valhalla Gold + Runic Steel, dark-first with light/dark/system setting; Cinzel display + Chakra Petch body; SVG icon set; safe-area + standalone PWA; motion system (entrances, live countdowns, count-ups, skeletons); reduced-motion respected.
- **i18n**: `src/i18n/dictionaries.ts` (en/fr/ar, identical key sets enforced by `Dict = typeof en`), RTL via `document.dir`, locale dates.

## Setup

```bash
cd app
cp .env.example .env   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (+ VITE_VAPID_PUBLIC_KEY)
npm install
npm run dev    # http://127.0.0.1:5173
npm test       # vitest run (23)
npm run build  # tsc + vite + PWA precache
```

Database: run **`app/supabase/FULL_SETUP.sql` once** in SQL editor (all tables/policies/buckets/realtime, idempotent), then any newer `00NN_*.sql` files not yet covered (check dates). Then: first user via Auth (auto-confirm) + `profiles` row `OWNER`/`ACTIVE`; **Confirm sign up** email OFF while testing.

VAPID (push): public key → `VITE_VAPID_PUBLIC_KEY` (local .env + Netlify env); private key stays secret for the Edge Function (`supabase secrets set …; supabase functions deploy send-push`).

## Deploy (Netlify)

- Base `app`, build `npm run build`, publish `dist`; env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ VAPID public).
- `netlify.toml` omits those public keys from secrets scanning (anon key is public by design; RLS protects data).
- SPA fallback via `app/public/_redirects`; icons from `scripts/gen-icons.mjs` + `public/logo.png`.
- Push only on command. To save credits: Site configuration → Build & deploy → pause auto-publishing.

## Repo layout

```
app/
  public/          logo.png, coin.png (add yours), PWA icons, _redirects
  scripts/         gen-icons.mjs
  src/
    app/           router, providers (Query + auth init + realtime binder + focus refetch)
    competition/   pure engines + tests (league/knockout/standings/deadline/replacement/joinCode)
    components/    ui (Icon/Avatar/AppBar/BottomNav/StatusBadge/CopyButton/CoinImg/InstallPrompt/Motion), battle, competition, match, player, clan, admin
    pages/         Home, Login, Competitions, CompetitionDetail, Match, Join, Clan, Player, Profile, Settings, Code, Battles, Saga, Admin, Notifications
    services/      auth/player/clan/competition/match/standings/dispute/replacement/statistics/rating/announcement/notification/honour/throne/challenge/squad/saga/storage/push
    stores/        authStore (zustand)   hooks/ useOath, useRealtime
    i18n/          dictionaries + LocaleContext (t(), fmtDate(), statusLabel())
    sw.ts          custom service worker (precache + push + tap-to-open)
    utils/         shareBattle (canvas posters), theme.tsx (dark/light/system)
  supabase/migrations/  0001–0020 (+ FULL_SETUP.sql bundle)
  supabase/functions/send-push/  Web Push sender
```

## Conventions

- DB is source of truth; client countdowns informational; capacity/deadlines re-validated service-side.
- Only CONFIRMED/FORFEIT results affect standings/stats/streaks/XP (matches AND battles).
- Notifications + non-critical writes are fire-and-forget (never break core flows).
- XP/claims/gifts idempotent (unique refs, period locks, balance checks) — safe to retry.
- Never expose service-role keys; anon key is public; `.env` + `.vapid-private` gitignored.

## Security note

`.env.example` holds placeholders only. Real keys were once committed and purged via history rewrite + rotation — if it happens again: replace file, rewrite history or rotate keys, update Netlify env + local `.env`.

## Roadmap (deferred, needs decisions/infra)

- Team cups 4v4/3v3 brackets from War Council squads.
- Clan-wide expedition missions, cosmetics, season entity, Great Hall feed.
