# theLastVikingClan — VIK Clan PWA

Private eFootball Mobile clan management & competition platform for **The Last Viking** (`VIK`).
One clan, one living Norse kingdom: leagues, cups, battles, throne, saga progression, clan code — as an installable mobile-first PWA in **English, French and Arabic (RTL)**.

Live loop: **next match → deadline → play → submit + screenshot → opponent confirms → standings update.**

> Push to GitHub/Netlify only on your word (Netlify builds cost free-tier credits).

## The clan

- **Identity:** Norse-inspired competitive brotherhood — honor, loyalty, discipline, legacy. Emblem in `app/public/logo.png` (favicon, PWA/iOS icons, headers, share posters).
- **Clan Code** (`/code`): 9 Laws (Honor → Legacy), the Viking's Oath (sworn once, timestamped, **required before joining**), the Legacy (Hall of Fame), war-words commands with copy buttons.
- **Battles** (`/battles`, nav: Arena): Calls for a Head — **regular** (refusable) or **unrefusable 100 GP must-answer** (needs 100 GP balance, winner takes +100 bounty); Friendly Duels incl. **open mat** (clan-wide alert, 24h expiry with renew/cancel, first to accept plays, callers see their own calls); Honor Duels incl. **throne challenges**; Blood-Debt rematches; result needs **mandatory screenshot** (inline, tap to enlarge) + optional note; War Council **3v3/4v4 squads** (leader invites + member requests, both sides accept); fair-play reports (no tag, misconduct, cheating); war-words commands with copy buttons (rival name autocompletes from the clan roster); shareable 1080px battle posters + WhatsApp handshake button on accepted fights.
- **King's Throne**: champion card on Home (reign, defenses, history), challenge-for-throne pledge, auto-transfer on lost title battle (+1 defense on hold), admin crowning/vacating, full reign log.
- **Saga progression** (`/saga`): Glory XP (verified matches, quests, bounties, gifts), 8 Norse levels (Outsider→Legend, shown named on the profile trophy badge), daily/weekly quest board with **period-locked claims**, seasonal leaderboard, win-streak badges (x5/x10), First Blood, 3-dimension peer ratings (tactical/fair-play/connection + title tags), GP gift favors (ask/accept, real ledger transfers).
- **Competitions**: leagues (round-robin), cups (knockout), tournaments (bracket), special events — each explained in-app. Join codes/links with one-tap copy, capacity + deadlines enforced, waitlist only when FULL, auto open→close→finish lifecycle with manual override + reopen, standings from CONFIRMED only, player replacement (future fixtures only, history kept). Round gating: round 1 opens at fixture generation, each next round opens when the previous round is fully played (auto) or when staff force-starts it (moderator included) — players can't submit locked rounds. Fixture rows carry tab counts, live countdowns, avatars, and a **message-opponent button** (WhatsApp direct with prefilled text, share-sheet fallback) using the official WhatsApp brand mark (`WhatsAppIcon`, `public/whatsapp.svg`).
- **League & cup simulator** (`/sim`, linked from Competitions — fake data, never touches the DB): 16-player round-robin (15 matchdays, 120 fixtures via the real `generateRoundRobin` + `calculateStandings` engines and the real table UI) and 16-player single-elimination cup (pure-CSS bracket with connector elbows, champion node). Player/Admin POV toggle — players submit, admins confirm/reject with comment, DM either side (WhatsApp buttons), screenshots zoomable, animated random draw ceremony (ties lock one by one) auto-recorded to a shareable portrait video, plus an auto-generated full-results recap video at the final.
- **Matches**: submit score + **mandatory screenshot** (styled upload, button explains itself) + fair-play checklist (tag worn, clean play) + optional note + issue reports (auto-file disputes) → opponent sees **Confirm + Wrong?** with submitter name, note and zoomable proof → moderator **review card** (score, proof, who/when, confirm-set/forfeit/**send-back with comment**) → standings recompute from CONFIRMED only → Glory + streak badges auto-awarded. Evidence kept until its league round ends (auto-deleted when every match of the round is final, plus 24h-after-final Free-storage sweep and auto-purge on Finish); replaced avatars/banners/evidence deleted, never orphaned.
- **Trust & safety**: dispute queue with audit log; RLS on every table; soft-delete with **two-person rule** for started competitions (requester can never self-approve; restorable, never hard-deleted).
- **Profiles**: rune-forged eFootball card (tap photo to change it, native color-well banner color/image + screen eyedropper, IG/TikTok/Kick links, WhatsApp number + chat button, real / **unique** warrior-tagged / in-game names with hints, eFootball brand mark by the game name, flag + country picker from full list, labeled About area), scramble-decode VIK name, stats panel (win rate · goals · clean sheets + W/D/L bar), horizontal last-5 (avatar → name → type → score, matches + battles merged), share-as-image posters, member management (roles/status, owner-only guards, **owner role locked**). Clan member list shows **no role badges** (only inactive-status badges). No last-seen timestamps, no availability dots. New accounts complete name + VIK tag + phone in a blocking gate for **+80 GP**.
- **Clan Member Book** (`/gallery`, from Clan): closed book with full-bleed AI cover (`book-cover.jpg`, tap/Next to open, back past the cover closes it), rune page art (`book-page.jpg`) with glass member cards (9-per-spread grids, 5+4 desktop), search + bookmarks + Viking index with roles, back colophon. Page-turn animation currently parked — navigation swaps instantly (buttons, swipe, keys, index). Paper-flick turn sound + swords unsheathe on open (`utils/sfx.ts`, `vik-sound` mutes); cover/page art + audio precached for offline.
- **Badge forge** (`src/services/badgeForge.ts`, Admin → Honours): one Viking badge PNG per honour (8 achievement types + 8 saga ranks, shared engraved-ring/knotwork/rune-circle family, per-type metal/motif/rune). Default on-device procedural renderer (no GPU); optional local Stable Diffusion via `VITE_BADGE_DIFFUSION_URL` (A1111/Forge API) with automatic fallback. Exact names/titles always drawn programmatically post-generation. Batch with hardware-throttled queue (concurrency from CPU count), 2 retries, unique filenames, progress + per-item errors; files in `clan-assets/badges/`, path on `achievements.image_url`. Agent API: `generateOne`, `generateBatch`, `previewBadge`, `buildBadgePrompt`. **Badge pictures** (Admin → Honours): one uploaded template per badge type in `clan-assets/badge-templates/{TYPE}.png` (upsert) — every award of that type shows the latest upload, past and future; falls back to the award's forged PNG, then vintage emblem art (`HonourBadge` component).
- **Vintage emblems** (`public/emblems/`, `src/components/emblem/Emblem.tsx`): instant SVG badge art per honour type + clan plate on the gallery cover, shown wherever a forged PNG is not yet available. Built with the [illustration-vintage-emblem skill](https://github.com/MengTo/Skills) (seven-colour screen-print, path wordmarks, palette-linted) — generator: `vik-emblems.gen.mjs` + skill `emblem-kit`/`wordmark` tooling.
- **Community**: announcements (publish → all notified), notification center with deep links (match/competition/battle/home, one link each), realtime + throttled focus-refetch (60s min interval, 30s min absence, `active` queries only) + manual refresh + Home action center, PWA install (Home card + permanent Settings → Install entry sharing one `useInstallPrompt` deferred prompt; Android manual ⋮ → Install steps; install requires the HTTPS deploy, never LAN/localhost), update prompt with 24h dismiss memory.
- **Push (Raven Messages)**: custom service worker (precache + offline navigation fallback + push display + tap-to-open), `send-push` Edge Function (JWT-verified, owner-only delivery, dead-subscription pruning), Settings subscribe toggle with iPhone install-first guidance. Needs: VAPID keys + `supabase functions deploy send-push`.
- **Tryouts** (recruitment): logged-out visitors apply from Login (name + WhatsApp + email + note → `tryout_requests` PENDING). Admin → Tryouts queue: WhatsApp chat button, tester assignment, PASS/FAIL verdict with tester/candidate scores + note, then **Accept** (provisions a real account via the `accept-tryout` Edge Function — pre-confirmed user + ACTIVE PLAYER profile, one-time temp password shown once for the admin to forward over WhatsApp) or Decline. Testers see their tasks in `TesterTasks`. Needs: migrations `0029`–`0032` + `supabase functions deploy accept-tryout`.

## Roles & permissions

| Role | Can |
|---|---|
| OWNER | Everything: grant/revoke Admin, remove members, clan settings, approve deletions, crown, audit. The Owner role is **locked** — it can never be changed to another role by anyone, and the Admin UI hides role editing for owners. |
| ADMIN | Create/edit competitions, fixtures, registration, disputes queue, replacements, announcements, honours, throne crown; manage members up to Moderator (role dropdown offers PLAYER/MODERATOR only — Admin/Owner grants are owner-only). Tryout queue + verdicts + accept/decline. |
| MODERATOR | Review card on submitted results (confirm/set/forfeit/send-back), resolve disputes, start competition rounds. No Admin dashboard. |
| PLAYER | View, join (after oath), submit/confirm/dispute, challenges, quests, gifts, rate peers, edit own profile. |

## Tech

- **App** (`app/`): React 19 + TypeScript + Vite, Tailwind v4, React Router (auth-guarded + `*` fallback to Home), TanStack Query (keep-previous-data, throttled focus refetch), Zustand, Supabase JS, vite-plugin-pwa (injectManifest custom SW), Vitest (34 tests). Quality gate: `npm run check` = `oxlint` + `tsc -b` + `vitest run`.
- **Backend**: Supabase Postgres + Auth + Storage + Realtime + Edge Functions `send-push` (push) and `accept-tryout` (tryout → account provisioning, OWNER/ADMIN-only, CORS-enabled). No custom server otherwise.
- **Design**: Valhalla Gold + Runic Steel, dark-first with light/dark/system setting; Cinzel display + Chakra Petch body; SVG icon set; safe-area + standalone PWA; motion system (entrances, live countdowns, count-ups, skeletons, nav glow); sticky action bars; reduced-motion respected.
- **i18n**: `src/i18n/dictionaries.ts` (en/fr/ar, identical key sets enforced by `Dict = typeof en`), RTL via `document.dir`, locale dates. Bottom nav: Hall · Arena · League · Code · Profile. Top bar: emblem, live GP + coin, raven bell.

## Setup

```bash
cd app
cp .env.example .env   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (+ VITE_VAPID_PUBLIC_KEY)
npm install
npm run dev      # http://127.0.0.1:5173
npm run check    # lint + typecheck + vitest (34) — run before every PR/build
npm run build    # tsc -b + vite + PWA precache
```

Database: **fresh installs** run **`app/supabase/FULL_SETUP.sql` once** in SQL editor (now bundles `0001`–`0032`, idempotent — incl. tryout_requests + verdict + email columns). **Existing DBs** created from an older bundle: run only the missing `supabase/migrations/00NN_*.sql` files in numeric order instead (`0023` unique warrior tags, `0024` badge image column, `0025` forfeit claims, `0026` quest names, `0027` registration open, `0028` clan-asset policies, `0029`–`0032` tryout system, `0033` round control for moderators). Then: private buckets `avatars`, `clan-assets`, `match-evidence`; first user via Auth (auto-confirm) + `profiles` row `OWNER`/`ACTIVE`; **Confirm sign up** email OFF while testing.

Setup health: Admin → **Setup health → Run check** (`src/services/setupCheck.ts`) verifies `.env`, private buckets, `OWNER`/`ACTIVE` bootstrap, and VAPID key with fix hints — no more manual guessing.

VAPID (push): public key → `VITE_VAPID_PUBLIC_KEY` (local .env + Netlify env); private key stays secret for the Edge Function (`supabase secrets set …; supabase functions deploy send-push`).

Tryout provisioning: no secrets to set (`SUPABASE_URL` + `SERVICE_ROLE_KEY` are auto-injected) — just `supabase link --project-ref <ref>` then `supabase functions deploy accept-tryout`. The function ships CORS headers (`authorization, x-client-info, apikey, content-type`) so `supabase.functions.invoke('accept-tryout')` works from the browser.

## Deploy (Netlify)

- Base `app`, build `npm run build`, publish `dist`; env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ VAPID public).
- `netlify.toml` omits those public keys from secrets scanning (anon key is public by design; RLS protects data).
- SPA fallback via `app/public/_redirects`; icons from `scripts/gen-icons.mjs` + `public/logo.png` (+ `coin.png` for Glory).
- Push only on command. To save credits: Site configuration → Build & deploy → pause auto-publishing.

## Repo layout

```
app/
  public/          logo.png, coin.png, whatsapp.svg, efootball.svg, book-cover.jpg, book-page.jpg, book-open.mp3, PWA icons, splash screens, _redirects
  scripts/         gen-icons.mjs
  src/
    app/           router (auth guard + * fallback), providers (Query + auth init + realtime binder + throttled focus refetch)
    competition/   pure engines + tests (league/knockout/standings/deadline/replacement/joinCode)
    components/    ui (Icon/Avatar/WhatsAppIcon/AppBar/BottomNav/StatusBadge/CopyButton/CoinImg/InstallPrompt/Motion/UpdateBanner/OfflineBanner), battle, competition, match, player, clan, admin
    pages/         Home, Login, Competitions, CompetitionDetail, Match, Join, Clan, Player, Profile, Settings, Code, Battles, Saga, Gallery (Saga Book), Admin (+Setup health card), Notifications, Sim (16-player league/cup demo, fake data, Player/Moderator/Admin POV)
    services/      auth/player/clan/competition/match/standings/dispute/replacement/statistics/rating/announcement/notification/honour/throne/challenge/squad/saga/storage/push/setupCheck/badgeForge (+badgeForge.test), tryoutService (tryout queue + acceptWithAccount)
    components/    onboarding/OnboardingGate (+80 GP gate), emblem/Emblem (vintage badge art), tryouts/TesterTasks, admin/TryoutsTab + AccessTab
    public/emblems/  9 vintage emblem SVGs (clan + 8 honour types)
    stores/        authStore (zustand)   hooks/ useOath, useRealtime, usePersistentTab
    i18n/          dictionaries + LocaleContext (t(), fmtDate(), statusLabel())
    sw.ts          custom service worker (precache + offline nav + push + tap-to-open)
    utils/         shareBattle (canvas posters), sfx (page-turn flick, book-open swords, rune click), theme.tsx, countries.ts
  supabase/migrations/  0001–0033 (= FULL_SETUP.sql bundle; keep in sync — new migration → append to bundle; 0029–0032 = tryout system, 0033 = round staff policy)
  supabase/functions/accept-tryout/  tryout → account provisioning (OWNER/ADMIN-only, CORS-enabled)
  supabase/functions/send-push/  Web Push sender
```

## Conventions

- DB is source of truth; client countdowns informational; capacity/deadlines re-validated service-side.
- Focus refetch is throttled (60s min interval, skips <30s absences, `refetchType: 'active'`) — realtime covers quick tab switches.
- Only CONFIRMED/FORFEIT results affect standings/stats/streaks/XP (matches AND battles).
- Notifications + non-critical writes are fire-and-forget (never break core flows).
- XP/claims/gifts idempotent (unique refs, period locks, balance checks) — safe to retry.
- Never expose service-role keys; anon key is public; `.env` + `.vapid-private` gitignored.

## Security note

`.env.example` holds placeholders only. Real keys were once committed and purged via history rewrite + rotation — if it happens again: replace file, rewrite history or rotate keys, update Netlify env + local `.env`.

## Roadmap (deferred, needs decisions/infra)

- Team cups 4v4/3v3 brackets from War Council squads.
- Clan-wide expedition missions, cosmetics, season entity, Great Hall feed.
