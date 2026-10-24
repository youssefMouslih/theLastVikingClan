import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Avatar from '../components/ui/Avatar';
import Icon from '../components/ui/Icon';
import InstallPrompt from '../components/ui/InstallPrompt';
import { CountUp, Countdown, FadeIn } from '../components/ui/Motion';
import { matchShouldBeOverdue } from '../competition/deadlineEngine';
import StatusBadge from '../components/ui/StatusBadge';
import { useLocale } from '../i18n/LocaleContext';
import { listActiveAnnouncements } from '../services/announcementService';
import { getClanSettings } from '../services/clanService';
import { listCompetitions } from '../services/competitionService';
import { listMyUpcoming, recentConfirmedResults } from '../services/matchService';
import { listIncoming } from '../services/challengeService';
import { listIncomingGifts } from '../services/sagaService';
import TesterTasks from '../components/tryouts/TesterTasks';
import LeagueEntryCard from '../components/league4v4/LeagueEntryCard';
import { listNotifications } from '../services/notificationService';
import { listActiveMembers } from '../services/playerService';
import { getCurrentReign, getReignHistory } from '../services/throneService';
import { useAuthStore } from '../stores/authStore';

// Home prioritizes actionable information (§16): next match, deadline,
// position, announcements + activity feed (§66).
export default function HomePage() {
  const { t, fmtDate } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const clanQuery = useQuery({ queryKey: ['clan-settings'], queryFn: getClanSettings });
  const membersQuery = useQuery({ queryKey: ['active-members'], queryFn: listActiveMembers });
  const upcomingQuery = useQuery({ queryKey: ['my-upcoming', me?.id], queryFn: () => listMyUpcoming(me!.id), enabled: !!me });
  const pendingBattles = useQuery({ queryKey: ['battles-in', me?.id], queryFn: () => listIncoming(me!.id), enabled: !!me });
  const pendingGifts = useQuery({ queryKey: ['gifts-in', me?.id], queryFn: () => listIncomingGifts(me!.id), enabled: !!me });
  const activityQuery = useQuery({ queryKey: ['activity'], queryFn: () => recentConfirmedResults(5) });
  const announcementsQuery = useQuery({ queryKey: ['announcements'], queryFn: listActiveAnnouncements });
  const notifQuery = useQuery({ queryKey: ['notifications'], queryFn: () => listNotifications(me!.id, 20), enabled: !!me });
  const compsQuery = useQuery({ queryKey: ['competitions'], queryFn: () => listCompetitions() });
  const throneQuery = useQuery({ queryKey: ['throne'], queryFn: getCurrentReign });
  const reignsQuery = useQuery({ queryKey: ['throne-history'], queryFn: () => getReignHistory(5) });
  const clan = clanQuery.data;
  const next = upcomingQuery.data?.[0];
  const unread = (notifQuery.data ?? []).filter((n) => !n.read_at).length;
  const compNames = Object.fromEntries((compsQuery.data ?? []).map((c) => [c.id, c.name]));
  const memberNames = Object.fromEntries((membersQuery.data ?? []).map((m) => [m.id, m.display_name ?? m.username]));
  const actionBattles = (pendingBattles.data ?? []).filter((b) => b.status === 'PENDING' || b.status === 'RESULT_SUBMITTED').length;
  const actionGifts = (pendingGifts.data ?? []).length;

  return (
    <main className="page max-w-4xl">
      <header className="hero relative isolate flex items-center gap-4 !p-5 sm:!p-7">
        <img src="/logo.png" alt="" width={56} height={56} aria-hidden className="relative z-10 h-14 w-14 shrink-0 rounded-xl object-cover shadow-lg shadow-brand-500/30" />
        <div className="relative z-10 min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand-300">{t('nav.hall')}</p>
          <h1 className="font-display mt-1 truncate text-2xl tracking-wide sm:text-3xl">
            {clan?.name ?? 'VIK Clan'} {clan?.tag ? `[${clan.tag}]` : ''}
          </h1>
          <p className="mt-1 text-sm opacity-75">{t('home.greeting', { name: me?.display_name ?? me?.username ?? 'Player' })}</p>
        </div>
        <Icon name="shield" className="pointer-events-none absolute -end-5 -bottom-8 z-0 h-36 w-36 rotate-12 text-brand-300 opacity-[0.08]" />
        <Link to="/notifications" aria-label={`${t('notif.title')}${unread ? `, ${unread}` : ''}`} className="btn-ghost relative z-10 h-11 w-11 shrink-0 !px-0">
          <Icon name="bell" className="h-5 w-5" />
          {unread > 0 && <span className="absolute -end-1 -top-1 rounded-full bg-accent-600 px-1.5 text-[11px] font-bold text-white">{unread}</span>}
        </Link>
      </header>

      <InstallPrompt />

      {(actionBattles > 0 || actionGifts > 0) && (
        <section aria-label={t('home.actionNeeded')} className="card mt-3 border-accent-500/50">
          <h2 className="card-title flex items-center gap-1"><Icon name="alert" className="h-4 w-4 text-accent-400" /> {t('home.actionNeeded')}</h2>
          <div className="mt-2 flex flex-col gap-2">
            {actionBattles > 0 && (
              <Link to="/battles" className="btn-cta h-11 w-full text-sm">
                {t('home.answerBattles', { n: actionBattles })}
              </Link>
            )}
            {actionGifts > 0 && (
              <Link to="/saga" className="btn-ghost h-11 w-full text-sm">
                {t('home.answerGifts', { n: actionGifts })}
              </Link>
            )}
          </div>
        </section>
      )}

      <TesterTasks />

      <LeagueEntryCard compact />

      <section aria-label={t('home.nextMatch')} className="hero hero-glow mt-4">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-70"><Icon name="swords" className="h-4 w-4" /> {t('home.nextMatch')}</h2>
        {upcomingQuery.isLoading ? (
          <p className="mt-1 text-sm opacity-70">{t('common.loading')}</p>
        ) : next ? (
          <>
            <p className="font-display mt-2 text-xl tracking-wide">
              {memberNames[next.player_a_id] ?? 'You'} <span className="text-accent-400">vs</span> {memberNames[next.player_b_id] ?? 'Opponent'}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs opacity-70">
              <Icon name="trophy" className="h-3.5 w-3.5" /> {compNames[next.competition_id] ?? 'Competition'} • <StatusBadge value={next.status} /> • <Icon name="clock" className="h-3.5 w-3.5" /> {next.deadline ? fmtDate(next.deadline) : '—'}
            </p>
            {next.deadline && (matchShouldBeOverdue(next.status, next.deadline) ? null : (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm">
                <span className="live-dot" aria-hidden /> <Countdown deadline={next.deadline} />
              </p>
            ))}
            <Link to={`/matches/${next.id}`} className="btn-cta mt-3 w-full">
              {t('home.viewMatch')}
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm opacity-80">{t('home.noUpcoming')}</p>
            <Link to="/competitions" className="btn-primary mt-3 w-full">
              {t('home.viewCompetitions')}
            </Link>
          </>
        )}
      </section>

      <section aria-label={t('throne.title')} className="hero relative mt-4 border-brand-500/40">
        <div className="flex items-center gap-2 text-brand-300">
          <Icon name="crown" className="h-5 w-5" />
          <h2 className="text-xs font-bold uppercase tracking-[0.2em]">{t('throne.title')}</h2>
        </div>
        {throneQuery.isLoading ? (
          <div role="status" className="mt-4 flex items-center gap-3" aria-label={t('common.loading')}>
            <span aria-hidden className="skeleton h-16 w-16 !rounded-full" />
            <span aria-hidden className="skeleton h-10 flex-1" />
          </div>
        ) : throneQuery.isError ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p role="alert" className="text-sm">{t('common.failed')}</p>
            <button type="button" onClick={() => throneQuery.refetch()} className="btn-ghost h-11 px-4 text-sm">
              {t('common.retry')}
            </button>
          </div>
        ) : throneQuery.data?.holder ? (
          <div className="relative mt-4">
            <Icon name="trophy" className="pointer-events-none absolute -end-2 -top-2 h-24 w-24 text-brand-300 opacity-[0.08]" />
            <Link to={`/players/${throneQuery.data.holder_id}`} className="relative flex min-w-0 items-center gap-4">
              <span className="rounded-full border border-brand-400/50 bg-brand-500/10 p-1">
                <Avatar
                  path={throneQuery.data.holder.avatar_url}
                  name={throneQuery.data.holder.display_name ?? throneQuery.data.holder.username}
                  className="h-16 w-16 text-2xl sm:h-20 sm:w-20"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wider text-brand-300">{t('throne.holder')}</span>
                <span className="font-display mt-1 block truncate text-xl leading-tight sm:text-2xl">
                  {throneQuery.data.holder.display_name ?? throneQuery.data.holder.username}
                </span>
                <span className="mt-2 block text-xs leading-relaxed opacity-75">
                  {t('throne.reignSince', { date: fmtDate(throneQuery.data.started_at, false) })}
                  <span aria-hidden> · </span>
                  {t('throne.defenses', { n: throneQuery.data.defenses })}
                </span>
              </span>
              <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-brand-300" />
            </Link>
            {throneQuery.data.holder_id !== me?.id && (
              <Link to={`/battles?opponent=${throneQuery.data.holder_id}&throne=1`} className="btn-cta mt-4 w-full text-sm">
                {t('throne.challenge')}
              </Link>
            )}
            {reignsQuery.isError ? (
              <p role="alert" className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-xs">
                <span>{t('common.failed')}</span>
                <button type="button" onClick={() => reignsQuery.refetch()} className="font-semibold text-brand-300 underline underline-offset-2">
                  {t('common.retry')}
                </button>
              </p>
            ) : reignsQuery.isLoading ? (
              <p role="status" className="mt-4 border-t border-white/10 pt-3 text-xs opacity-70">{t('common.loading')}</p>
            ) : (reignsQuery.data ?? []).length > 1 ? (
              <details className="mt-4 border-t border-white/10 pt-3">
                <summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold text-brand-300 underline underline-offset-2">
                  {t('throne.history')}
                </summary>
                <ol className="mt-2 flex flex-col gap-2">
                  {(reignsQuery.data ?? []).slice(1).map((r, i) => (
                    <li key={r.id} className="flex items-center gap-3 border-s border-brand-400/40 py-1 ps-3 text-sm">
                      <span className="font-display text-xs text-brand-300" aria-label={`#${i + 2}`}>{String(i + 2).padStart(2, '0')}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{r.holder?.display_name ?? r.holder?.username ?? '?'}</span>
                      <span className="shrink-0 text-xs opacity-70">{t('throne.defenses', { n: r.defenses })}</span>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 flex items-start gap-3 text-sm leading-relaxed opacity-80">
            <Icon name="crown" className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
            {t('throne.vacant')}
          </p>
        )}
      </section>

      {(announcementsQuery.data ?? []).length > 0 && (
        <section aria-label="Announcements" className="mt-3 flex flex-col gap-2">
          {(announcementsQuery.data ?? []).slice(0, 3).map((a) => (
            <article key={a.id} className="card p-3 text-sm">
              <p className="flex items-center gap-1.5 font-bold"><Icon name="mega" className="h-4 w-4 text-accent-400" /> {a.title}</p>
              <p className="mt-0.5 opacity-80">{a.content}</p>
            </article>
          ))}
        </section>
      )}

      <FadeIn delay={60}>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <section className="card">
          <h2 className="card-title flex items-center gap-1"><Icon name="users" className="h-4 w-4" /> {t('home.clan')}</h2>
          <p className="font-display mt-1 text-2xl">{membersQuery.data ? <CountUp value={membersQuery.data.length} /> : '—'}</p>
          <Link to="/clan" className="text-sm font-semibold text-brand-400">{t('home.membersRules')}</Link>
        </section>
        <section className="card">
          <h2 className="card-title flex items-center gap-1"><Icon name="trophy" className="h-4 w-4" /> {t('home.compete')}</h2>
          <p className="font-display mt-1 text-2xl">{compsQuery.data ? <CountUp value={compsQuery.data.filter((c) => c.status === 'ACTIVE' || c.status === 'REGISTRATION_OPEN').length} /> : '—'}</p>
          <Link to="/competitions" className="text-sm font-semibold text-brand-400">{t('home.openCompetitions')}</Link>
        </section>
      </div>
      </FadeIn>

      <Link to="/saga" className="card mt-3 flex items-center gap-3 p-3">
        <Icon name="medal" className="h-7 w-7 text-brand-400" />
        <span className="flex-1">
          <span className="font-display block text-sm tracking-wide">{t('saga.title')}</span>
          <span className="text-xs opacity-70">{t('saga.teaser')}</span>
        </span>
        <Icon name="back" className="h-5 w-5 rotate-180 opacity-50" />
      </Link>

      <FadeIn delay={120}>
      <section aria-label={t('home.recentResults')} className="card mt-3">
        <h2 className="card-title">{t('home.recentResults')}</h2>
        {(activityQuery.data ?? []).length === 0 ? (
          <p className="mt-1 text-sm opacity-70">{t('home.noResults')}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {(activityQuery.data ?? []).map((m) => (
              <li key={m.id}>
                <Link to={`/matches/${m.id}`} className="underline">
                  {memberNames[m.player_a_id] ?? '?'} {m.score_a}–{m.score_b} {memberNames[m.player_b_id] ?? '?'}
                </Link>
                <span className="opacity-60"> • {compNames[m.competition_id] ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </FadeIn>
      <BottomNav />
    </main>
  );
}
