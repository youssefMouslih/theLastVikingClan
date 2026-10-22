import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, FadeIn, LoadingRegion } from '../components/ui/Motion';
import QueryError from '../components/ui/QueryError';
import StatusBadge from '../components/ui/StatusBadge';
import LeagueSeasonSelect from '../components/league4v4/LeagueSeasonSelect';
import LeagueFixtureCard from '../components/league4v4/LeagueFixtureCard';
import { useLocale } from '../i18n/LocaleContext';
import { findNextLeagueFixture, getLeagueSchedule } from '../services/leagueFixtureService';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../services/leagueSeasonService';
import { getLeagueStandings } from '../services/leagueStandingsService';
import { findMyLeagueTeam, listIncomingLeagueInvites } from '../services/leagueTeamService';
import { useAuthStore } from '../stores/authStore';

export default function League4v4HubPage() {
  const { t, fmtDate } = useLocale();
  const me = useAuthStore((state) => state.profile);
  const canManage = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const canDisputeStaff = canManage || me?.role === 'MODERATOR';
  const [selectedId, setSelectedId] = useState('');
  const seasonsQuery = useQuery({ queryKey: leagueKeys.seasons, queryFn: listLeagueSeasons });
  const seasons = seasonsQuery.data ?? [];
  const currentSeason = pickCurrentLeagueSeason(seasons);
  const season = seasons.find((item) => item.id === selectedId) ?? currentSeason;
  const isCurrent = !!season && season.id === currentSeason?.id;
  const seasonId = season?.id ?? '';
  const myTeamQuery = useQuery({
    queryKey: leagueKeys.myTeam(seasonId, me?.id ?? 'none'),
    queryFn: () => findMyLeagueTeam(seasonId, me!.id),
    enabled: !!season && !!me,
  });
  const invitesQuery = useQuery({
    queryKey: leagueKeys.incomingInvites(me?.id ?? 'none'),
    queryFn: () => listIncomingLeagueInvites(me!.id),
    enabled: !!me,
  });
  const scheduleQuery = useQuery({
    queryKey: leagueKeys.schedule(seasonId),
    queryFn: () => getLeagueSchedule(seasonId),
    enabled: !!season && season.status !== 'DRAFT',
  });
  const standingsQuery = useQuery({
    queryKey: leagueKeys.standings(seasonId),
    queryFn: () => getLeagueStandings(seasonId),
    enabled: !!season && (season.status === 'ACTIVE' || season.status === 'COMPLETED'),
  });
  const myTeam = myTeamQuery.data ?? null;
  const next = scheduleQuery.data ? findNextLeagueFixture(scheduleQuery.data, myTeam?.id) : null;
  const inviteCount = invitesQuery.data?.length ?? 0;
  const standings = standingsQuery.data ?? [];

  if (seasonsQuery.isLoading) {
    return <main className="page"><AppBar title={t('league4.title')} /><LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion><BottomNav /></main>;
  }

  if (seasonsQuery.isError) {
    return <main className="page"><AppBar title={t('league4.title')} /><QueryError error={seasonsQuery.error} onRetry={() => void seasonsQuery.refetch()} /><BottomNav /></main>;
  }

  if (!season) {
    return (
      <main className="page">
        <AppBar title={t('league4.title')} />
        <EmptyState icon={<Icon name="trophy" />} title={t('league4.noSeason')} hint={t('league4.noSeasonHint')} />
        {canManage && <Link to="/4vs4/admin" className="btn-primary mt-3 h-11 w-full">{t('league4.createSeason')}</Link>}
        {canDisputeStaff && <Link to="/4vs4/disputes" className="btn-ghost mt-2 h-11 w-full">{t('league4.disputes')}</Link>}
        <Link to="/competitions" className="btn-ghost mt-2 h-11 w-full">{t('league4.backCompetitions')}</Link>
        <BottomNav />
      </main>
    );
  }

  const registrationOpen = season.status === 'REGISTRATION' && isCurrent;
  return (
    <main className="page">
      <AppBar title={t('league4.title')} />
      <FadeIn>
        {seasons.length > 1 && (
          <LeagueSeasonSelect seasons={seasons} value={season.id} onChange={setSelectedId} />
        )}
        {!isCurrent && <p className="mt-2 rounded-xl border border-accent-500/40 bg-accent-500/5 p-2 text-xs opacity-80">{t('league4.pastSeasonNotice')}</p>}
        <section className="hero hero-glow mt-3">
          <div className="flex items-center gap-2">
            <Icon name="trophy" className="h-5 w-5 text-brand-400" />
            <h1 className="font-display min-w-0 flex-1 truncate text-xl tracking-wide">{season.name}</h1>
            <StatusBadge value={season.status} />
          </div>
          {season.description && <p className="mt-2 whitespace-pre-wrap text-sm opacity-80">{season.description}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-[var(--border)] p-2">
              <span className="block opacity-60">{t('league4.registrationCloses')}</span>
              <b>{season.registration_closes_at ? fmtDate(season.registration_closes_at) : '—'}</b>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-2">
              <span className="block opacity-60">{t('league4.startsAt')}</span>
              <b>{season.starts_at ? fmtDate(season.starts_at) : '—'}</b>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-2">
              <span className="block opacity-60">{t('league4.matchdayLength')}</span>
              <b>{t('league4.days', { n: season.matchday_days })}</b>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-2">
              <span className="block opacity-60">{t('league4.squadSize')}</span>
              <b>{season.roster_min}–{season.roster_max}</b>
            </div>
          </div>
        </section>

        {season.rules && (
          <section className="card mt-3">
            <h2 className="card-title flex items-center gap-1"><Icon name="scroll" className="h-4 w-4 text-brand-400" /> {t('league4.rules')}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm opacity-80">{season.rules}</p>
          </section>
        )}

        {inviteCount > 0 && (
          <Link to="/4vs4/my-team" className="card mt-3 flex items-center gap-2 border-accent-500/50">
            <Icon name="bell" className="h-5 w-5 text-accent-400" />
            <span className="flex-1 text-sm font-semibold">{t('league4.invitesWaiting', { n: inviteCount })}</span>
            <Icon name="back" className="h-4 w-4 rotate-180" />
          </Link>
        )}

        <section className="card mt-3">
          <h2 className="card-title flex items-center gap-1"><Icon name="users" className="h-4 w-4 text-brand-400" /> {t('league4.mySquad')}</h2>
          {myTeamQuery.isLoading ? (
            <p className="mt-2 text-sm opacity-60">{t('common.loading')}</p>
          ) : myTeam ? (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <Link to={`/4vs4/teams/${myTeam.id}`} className="min-w-0 flex-1 truncate font-display text-lg">{myTeam.name}</Link>
                <StatusBadge value={myTeam.status} />
              </div>
              <p className="text-xs opacity-60">{t('league4.playersCount', { n: myTeam.member_count })}</p>
              {isCurrent && <Link to="/4vs4/my-team" className="btn-primary mt-2 h-10 w-full text-sm">{t('league4.manageSquad')}</Link>}
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-sm opacity-70">{t('league4.noSquad')}</p>
              {isCurrent && (registrationOpen ? (
                <Link to="/4vs4/teams/create" className="btn-primary mt-2 h-10 w-full text-sm">{t('league4.createSquad')}</Link>
              ) : (
                <Link to={`/4vs4/teams?season=${season.id}`} className="btn-ghost mt-2 h-10 w-full text-sm">{t('league4.browseSquads')}</Link>
              ))}
            </div>
          )}
        </section>

        <section className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="card-title flex flex-1 items-center gap-1"><Icon name="swords" className="h-4 w-4 text-brand-400" /> {t('league4.nextFixture')}</h2>
            <Link to={`/4vs4/fixtures?season=${season.id}`} className="text-xs font-semibold text-brand-400">{t('league4.viewFixtures')}</Link>
          </div>
          {next ? <LeagueFixtureCard fixture={next} /> : <p className="card text-sm opacity-70">{season.status === 'ACTIVE' ? t('league4.noUpcomingFixture') : t('league4.fixturesNotScheduled')}</p>}
        </section>

        {standings.length > 0 && (
          <section className="card mt-3">
            <div className="flex items-center gap-2">
              <h2 className="card-title flex flex-1 items-center gap-1"><Icon name="medal" className="h-4 w-4 text-brand-400" /> {t('league4.topStandings')}</h2>
              <Link to={`/4vs4/standings?season=${season.id}`} className="text-xs font-semibold text-brand-400">{t('league4.fullTable')}</Link>
            </div>
            <ol className="mt-2 flex flex-col gap-1">
              {standings.slice(0, 5).map((row) => (
                <li key={row.team_id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm">
                  <span className="w-5 text-center text-xs font-bold opacity-60">{row.standing_position}</span>
                  <Link to={`/4vs4/teams/${row.team_id}`} className="min-w-0 flex-1 truncate font-semibold">{row.team_name}</Link>
                  <span className="text-xs opacity-60">{row.played}</span>
                  <span className="w-8 text-end font-bold tabular-nums">{row.points}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to={`/4vs4/teams?season=${season.id}`} className="btn-ghost h-11 text-sm">{t('league4.teams')}</Link>
          <Link to={`/4vs4/fixtures?season=${season.id}`} className="btn-ghost h-11 text-sm">{t('league4.fixtures')}</Link>
          <Link to={`/4vs4/standings?season=${season.id}`} className="btn-ghost h-11 text-sm">{t('league4.standings')}</Link>
          <Link to={`/4vs4/stats?season=${season.id}`} className="btn-ghost h-11 text-sm">{t('league4.stats')}</Link>
        </div>
        {canDisputeStaff && <Link to="/4vs4/disputes" className="btn-ghost mt-2 h-11 w-full text-sm">{t('league4.disputes')}</Link>}
        {canManage && isCurrent && <Link to="/4vs4/admin" className="btn-ghost mt-2 h-11 w-full text-sm">{t('league4.admin')}</Link>}
      </FadeIn>
      <BottomNav />
    </main>
  );
}
