import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, LoadingRegion } from '../components/ui/Motion';
import QueryError from '../components/ui/QueryError';
import StatusBadge from '../components/ui/StatusBadge';
import LeagueFixtureCard from '../components/league4v4/LeagueFixtureCard';
import LeagueSeasonSelect from '../components/league4v4/LeagueSeasonSelect';
import { useLocale } from '../i18n/LocaleContext';
import { getLeagueSchedule } from '../services/leagueFixtureService';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../services/leagueSeasonService';

export default function LeagueFixturesPage() {
  const { t, fmtDate } = useLocale();
  const [params, setParams] = useSearchParams();
  const seasonsQuery = useQuery({ queryKey: leagueKeys.seasons, queryFn: listLeagueSeasons });
  const seasons = seasonsQuery.data ?? [];
  const current = pickCurrentLeagueSeason(seasons);
  const season = seasons.find((item) => item.id === params.get('season')) ?? current;
  const scheduleQuery = useQuery({
    queryKey: leagueKeys.schedule(season?.id ?? 'none'),
    queryFn: () => getLeagueSchedule(season!.id),
    enabled: !!season,
  });
  const schedule = scheduleQuery.data;
  const matchdays = schedule?.matchdays ?? [];

  return (
    <main className="page">
      <AppBar title={t('league4.fixtures')} />
      <div className="mt-2 flex items-center gap-2">
        <Link to="/4vs4" className="btn-ghost h-10 px-3"><Icon name="back" className="h-4 w-4" /></Link>
        <p className="min-w-0 flex-1 truncate text-sm opacity-70">{season?.name ?? t('league4.title')}</p>
        {season && <StatusBadge value={season.status} />}
      </div>

      {seasonsQuery.isLoading || scheduleQuery.isLoading ? (
        <LoadingRegion loading label={t('common.loading')} skeleton="list"><span /></LoadingRegion>
      ) : seasonsQuery.isError ? (
        <QueryError error={seasonsQuery.error} onRetry={() => void seasonsQuery.refetch()} />
      ) : !season ? (
        <EmptyState icon={<Icon name="calendar" />} title={t('league4.noSeason')} hint={t('league4.noSeasonHint')} />
      ) : (
        <>
          {seasons.length > 1 && (
            <LeagueSeasonSelect
              seasons={seasons}
              value={season.id}
              onChange={(id) => setParams(id === current?.id ? {} : { season: id })}
            />
          )}
          {season.id !== current?.id && <p className="mt-2 rounded-xl border border-accent-500/40 bg-accent-500/5 p-2 text-xs opacity-80">{t('league4.pastSeasonNotice')}</p>}
          {scheduleQuery.isError ? (
            <QueryError error={scheduleQuery.error} onRetry={() => void scheduleQuery.refetch()} />
          ) : matchdays.length === 0 ? (
            <EmptyState icon={<Icon name="calendar" />} title={t('league4.fixturesNotScheduled')} hint={t('league4.fixturesNotScheduledHint')} />
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {matchdays.map((matchday) => (
                <section key={matchday.id} className="card">
                  <div className="flex items-center gap-2">
                    <span className="font-display flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/15 font-bold text-brand-400">{matchday.number}</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-bold">{t('league4.matchday')} {matchday.number}</h2>
                      <p className="text-xs opacity-60">{fmtDate(matchday.opens_at)} → {fmtDate(matchday.deadline)}</p>
                    </div>
                    <StatusBadge value={matchday.status} />
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    {matchday.fixtures.map((fixture) => <LeagueFixtureCard key={fixture.id} fixture={fixture} showMatchday={false} />)}
                  </div>
                  {matchday.byes.length > 0 && (
                    <p className="mt-2 rounded-lg border border-[var(--border)] p-2 text-xs opacity-70">
                      <b>{t('league4.bye')}:</b> {matchday.byes.map((team) => team.name).join(', ')}
                    </p>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}
      <BottomNav />
    </main>
  );
}
