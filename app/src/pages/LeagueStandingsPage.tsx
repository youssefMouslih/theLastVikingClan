import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import LeagueSeasonSelect from '../components/league4v4/LeagueSeasonSelect';
import LeagueStandingsTable from '../components/league4v4/LeagueStandingsTable';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, FadeIn, LoadingRegion } from '../components/ui/Motion';
import { useLocale } from '../i18n/LocaleContext';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../services/leagueSeasonService';
import {
  getLeagueStandings,
  listLeagueTiebreakOrder,
} from '../services/leagueStandingsService';

const TIEBREAK_RULES = [
  'league4.tiebreakRulePoints',
  'league4.tiebreakRuleDuelDiff',
  'league4.tiebreakRuleDuelsWon',
  'league4.tiebreakRuleHeadToHead',
  'league4.tiebreakRuleAdmin',
  'league4.tiebreakRuleName',
] as const;

export default function LeagueStandingsPage() {
  const { t } = useLocale();
  const [selectedId, setSelectedId] = useState('');
  const seasonsQuery = useQuery({ queryKey: leagueKeys.seasons, queryFn: listLeagueSeasons });
  const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);
  const autoId = seasons.length > 0 ? pickCurrentLeagueSeason(seasons)?.id ?? seasons[0].id : '';
  const activeId = selectedId || autoId;
  const season = seasons.find((item) => item.id === activeId) ?? null;
  const standingsActive = season?.status === 'ACTIVE' || season?.status === 'COMPLETED';
  const standingsQuery = useQuery({
    queryKey: leagueKeys.standings(activeId || 'none'),
    queryFn: () => getLeagueStandings(activeId),
    enabled: !!season && standingsActive,
  });
  const tiebreakQuery = useQuery({
    queryKey: leagueKeys.tiebreak(activeId || 'none'),
    queryFn: () => listLeagueTiebreakOrder(activeId),
    enabled: !!season,
  });
  const rows = standingsQuery.data ?? [];
  const hasTiebreak = (tiebreakQuery.data?.length ?? 0) > 0;

  if (seasonsQuery.isLoading) {
    return <main className="page"><AppBar title={t('league4.standings')} /><LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion><BottomNav /></main>;
  }

  return (
    <main className="page">
      <AppBar title={t('league4.standings')} />
      <div className="mt-2 flex items-center gap-2">
        <Link to="/4vs4" className="btn-ghost h-10 px-3"><Icon name="back" className="h-4 w-4" /></Link>
        <p className="min-w-0 flex-1 truncate text-sm opacity-70">{t('league4.title')}</p>
        <Link to="/4vs4/stats" className="btn-ghost h-10 px-3 text-xs">{t('league4.stats')}</Link>
      </div>

      {seasons.length === 0 ? (
        <EmptyState icon={<Icon name="medal" />} title={t('league4.noSeason')} hint={t('league4.noSeasonHint')} />
      ) : (
        <FadeIn>
          <LeagueSeasonSelect seasons={seasons} value={activeId} onChange={setSelectedId} />

          {!standingsActive ? (
            <EmptyState icon={<Icon name="medal" />} title={t('league4.noStandings')} hint={t('league4.noStandingsHint')} />
          ) : standingsQuery.isLoading ? (
            <LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion>
          ) : rows.length === 0 ? (
            <EmptyState icon={<Icon name="medal" />} title={t('league4.noStandings')} hint={t('league4.noStandingsHint')} />
          ) : (
            <>
              <p className="mt-3 text-xs opacity-60">{t('league4.includesPenalties')}</p>
              <div className="mt-2">
                <LeagueStandingsTable rows={rows} />
              </div>
              {hasTiebreak && (
                <p className="mt-2 rounded-lg border border-accent-500/40 p-2 text-xs opacity-80">{t('league4.adminTiebreakApplied')}</p>
              )}
              <section className="card mt-3">
                <h2 className="card-title flex items-center gap-1"><Icon name="chart" className="h-4 w-4 text-brand-400" /> {t('league4.tiebreakRules')}</h2>
                <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm opacity-80">
                  {TIEBREAK_RULES.map((key) => <li key={key}>{t(key)}</li>)}
                </ol>
              </section>
            </>
          )}
        </FadeIn>
      )}
      <BottomNav />
    </main>
  );
}
