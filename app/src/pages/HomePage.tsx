import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import InstallPrompt from '../components/ui/InstallPrompt';
import StatusBadge from '../components/ui/StatusBadge';
import { useLocale } from '../i18n/LocaleContext';
import { listActiveAnnouncements } from '../services/announcementService';
import { getClanSettings } from '../services/clanService';
import { listCompetitions } from '../services/competitionService';
import { listMyUpcoming, recentConfirmedResults } from '../services/matchService';
import { listNotifications } from '../services/notificationService';
import { listActiveMembers } from '../services/playerService';
import { useAuthStore } from '../stores/authStore';

// Home prioritizes actionable information (§16): next match, deadline,
// position, announcements + activity feed (§66).
export default function HomePage() {
  const { t, fmtDate } = useLocale();
  const me = useAuthStore((s) => s.profile);
  const clanQuery = useQuery({ queryKey: ['clan-settings'], queryFn: getClanSettings });
  const membersQuery = useQuery({ queryKey: ['active-members'], queryFn: listActiveMembers });
  const upcomingQuery = useQuery({ queryKey: ['my-upcoming', me?.id], queryFn: () => listMyUpcoming(me!.id), enabled: !!me });
  const activityQuery = useQuery({ queryKey: ['activity'], queryFn: () => recentConfirmedResults(5) });
  const announcementsQuery = useQuery({ queryKey: ['announcements'], queryFn: listActiveAnnouncements });
  const notifQuery = useQuery({ queryKey: ['notifications'], queryFn: () => listNotifications(me!.id, 20), enabled: !!me });
  const compsQuery = useQuery({ queryKey: ['competitions'], queryFn: () => listCompetitions() });
  const clan = clanQuery.data;
  const next = upcomingQuery.data?.[0];
  const unread = (notifQuery.data ?? []).filter((n) => !n.read_at).length;
  const compNames = Object.fromEntries((compsQuery.data ?? []).map((c) => [c.id, c.name]));
  const memberNames = Object.fromEntries((membersQuery.data ?? []).map((m) => [m.id, m.display_name ?? m.username]));

  return (
    <main className="page">
      <header className="flex items-center gap-3">
        <img src="/logo.png" alt="" aria-hidden className="h-10 w-10 rounded-xl object-cover shadow-lg shadow-brand-500/40" />
        <div className="flex-1">
          <div className="font-display text-sm tracking-wide">{clan?.name ?? 'VIK Clan'} {clan?.tag ? `[${clan.tag}]` : ''}</div>
          <div className="text-xs opacity-70">{t('home.greeting', { name: me?.display_name ?? me?.username ?? 'Player' })}</div>
        </div>
        <Link to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="btn-ghost relative h-11 w-11 !px-0">
          <Icon name="bell" className="h-5 w-5" />
          {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>}
        </Link>
      </header>

      <InstallPrompt />

      <section aria-label={t('home.nextMatch')} className="hero mt-4">
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

      <div className="mt-3 grid grid-cols-2 gap-3">
        <section className="card">
          <h2 className="card-title flex items-center gap-1"><Icon name="users" className="h-4 w-4" /> {t('home.clan')}</h2>
          <p className="font-display mt-1 text-2xl">{membersQuery.data?.length ?? '—'}</p>
          <Link to="/clan" className="text-sm font-semibold text-brand-400">{t('home.membersRules')}</Link>
        </section>
        <section className="card">
          <h2 className="card-title flex items-center gap-1"><Icon name="trophy" className="h-4 w-4" /> {t('home.compete')}</h2>
          <p className="font-display mt-1 text-2xl">{compsQuery.data?.filter((c) => c.status === 'ACTIVE' || c.status === 'REGISTRATION_OPEN').length ?? '—'}</p>
          <Link to="/competitions" className="text-sm font-semibold text-brand-400">{t('home.openCompetitions')}</Link>
        </section>
      </div>

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
      <BottomNav />
    </main>
  );
}
