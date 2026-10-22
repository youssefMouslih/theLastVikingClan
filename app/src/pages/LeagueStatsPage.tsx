import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import LeagueSeasonSelect from '../components/league4v4/LeagueSeasonSelect';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, FadeIn, LoadingRegion } from '../components/ui/Motion';
import QueryError from '../components/ui/QueryError';
import { formatDiff } from '../competition/league4v4/standings';
import { useLocale } from '../i18n/LocaleContext';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../services/leagueSeasonService';
import { getLeaguePlayerStats, getLeagueTeamStats } from '../services/leagueStatsService';

type StatsTab = 'players' | 'teams';

export default function LeagueStatsPage() {
  const { t } = useLocale();
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(params.get('season') ?? '');
  const [tab, setTab] = useState<StatsTab>('players');
  const seasonsQuery = useQuery({ queryKey: leagueKeys.seasons, queryFn: listLeagueSeasons });
  const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);
  const autoId = seasons.length > 0 ? pickCurrentLeagueSeason(seasons)?.id ?? seasons[0].id : '';
  const activeId = selectedId && seasons.some((item) => item.id === selectedId) ? selectedId : autoId;
  const season = seasons.find((item) => item.id === activeId) ?? null;
  const statsActive = season?.status === 'ACTIVE' || season?.status === 'COMPLETED';
  const playerQuery = useQuery({
    queryKey: leagueKeys.playerStats(activeId || 'none'),
    queryFn: () => getLeaguePlayerStats(activeId),
    enabled: !!season && statsActive && tab === 'players',
  });
  const teamQuery = useQuery({
    queryKey: leagueKeys.teamStats(activeId || 'none'),
    queryFn: () => getLeagueTeamStats(activeId),
    enabled: !!season && statsActive && tab === 'teams',
  });
  const players = playerQuery.data ?? [];
  const teams = teamQuery.data ?? [];
  const loading = tab === 'players' ? playerQuery.isLoading : teamQuery.isLoading;
  const empty = tab === 'players' ? players.length === 0 : teams.length === 0;

  if (seasonsQuery.isLoading) {
    return <main className="page"><AppBar title={t('league4.stats')} /><LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion><BottomNav /></main>;
  }

  return (
    <main className="page">
      <AppBar title={t('league4.stats')} />
      <div className="mt-2 flex items-center gap-2">
        <Link to="/4vs4" className="btn-ghost h-10 px-3"><Icon name="back" className="h-4 w-4" /></Link>
        <p className="min-w-0 flex-1 truncate text-sm opacity-70">{t('league4.title')}</p>
        <Link to="/4vs4/standings" className="btn-ghost h-10 px-3 text-xs">{t('league4.standings')}</Link>
      </div>

      {seasonsQuery.isError ? (
        <QueryError error={seasonsQuery.error} onRetry={() => void seasonsQuery.refetch()} />
      ) : seasons.length === 0 ? (
        <EmptyState icon={<Icon name="chart" />} title={t('league4.noSeason')} hint={t('league4.noSeasonHint')} />
      ) : (
        <FadeIn>
          <LeagueSeasonSelect
            seasons={seasons}
            value={activeId}
            onChange={(id) => {
              setSelectedId(id);
              setParams(id === autoId ? {} : { season: id }, { replace: true });
            }}
          />

          {!statsActive ? (
            <EmptyState icon={<Icon name="chart" />} title={t('league4.noStats')} hint={t('league4.noStatsHint')} />
          ) : (
            <>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setTab('players')} className={`${tab === 'players' ? 'btn-primary' : 'btn-ghost'} h-10 flex-1 text-sm`}>
                  {t('league4.playersTab')}
                </button>
                <button type="button" onClick={() => setTab('teams')} className={`${tab === 'teams' ? 'btn-primary' : 'btn-ghost'} h-10 flex-1 text-sm`}>
                  {t('league4.teamsTab')}
                </button>
              </div>

              {loading ? (
                <LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion>
              ) : (tab === 'players' ? playerQuery.isError : teamQuery.isError) ? (
                <QueryError
                  error={tab === 'players' ? playerQuery.error : teamQuery.error}
                  onRetry={() => void (tab === 'players' ? playerQuery.refetch() : teamQuery.refetch())}
                />
              ) : empty ? (
                <EmptyState
                  icon={<Icon name="chart" />}
                  title={t(tab === 'players' ? 'league4.noPlayerStats' : 'league4.noTeamStats')}
                  hint={t(tab === 'players' ? 'league4.noPlayerStatsHint' : 'league4.noTeamStatsHint')}
                />
              ) : tab === 'players' ? (
                <div className="mt-3 overflow-x-auto rounded-2xl border">
                  <table className="w-full min-w-[680px] text-sm" aria-label={t('league4.playerStats')}>
                    <thead>
                      <tr className="border-b text-left text-xs uppercase opacity-60">
                        <th className="p-2">#</th>
                        <th className="p-2">{t('league4.playersTab')}</th>
                        <th className="p-2">{t('league4.team')}</th>
                        <th className="p-2 text-center" title={t('league4.duelsPlayed')}>P</th>
                        <th className="p-2 text-center" title={t('league4.duelsWon')}>W</th>
                        <th className="p-2 text-center" title={t('league4.duelsLost')}>L</th>
                        <th className="p-2 text-center" title={t('league4.goalsFor')}>GF</th>
                        <th className="p-2 text-center" title={t('league4.goalsAgainst')}>GA</th>
                        <th className="p-2 text-center" title={t('league4.goalDiff')}>GD</th>
                        <th className="p-2 text-center">{t('league4.winRate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((row, index) => (
                        <tr key={row.player_id} className="border-b last:border-0">
                          <td className="p-2 text-center font-bold">{index + 1}</td>
                          <td className="max-w-[160px] truncate p-2 font-semibold">
                            <Link to={`/players/${row.player_id}`} className="underline decoration-brand-500/60 underline-offset-2">
                              {row.player_name}
                            </Link>
                          </td>
                          <td className="max-w-[160px] truncate p-2">
                            <Link to={`/4vs4/teams/${row.team_id}`} className="underline decoration-brand-500/60 underline-offset-2">
                              {row.team_name}
                            </Link>
                          </td>
                          <td className="p-2 text-center tabular-nums">{row.duels_played}</td>
                          <td className="p-2 text-center tabular-nums">{row.duels_won}</td>
                          <td className="p-2 text-center tabular-nums">{row.duels_lost}</td>
                          <td className="p-2 text-center tabular-nums">{row.goals_for}</td>
                          <td className="p-2 text-center tabular-nums">{row.goals_against}</td>
                          <td className="p-2 text-center tabular-nums">{formatDiff(row.goal_diff)}</td>
                          <td className="p-2 text-center font-bold tabular-nums">
                            {row.win_rate == null ? '—' : `${Math.round(row.win_rate)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-2xl border">
                  <table className="w-full min-w-[720px] text-sm" aria-label={t('league4.teamStats')}>
                    <thead>
                      <tr className="border-b text-left text-xs uppercase opacity-60">
                        <th className="p-2">#</th>
                        <th className="p-2">{t('league4.team')}</th>
                        <th className="p-2 text-center" title={t('league4.played')}>P</th>
                        <th className="p-2 text-center" title={t('league4.wins')}>W</th>
                        <th className="p-2 text-center" title={t('league4.draws')}>D</th>
                        <th className="p-2 text-center" title={t('league4.losses')}>L</th>
                        <th className="p-2 text-center" title={t('league4.duelsWon')}>DW</th>
                        <th className="p-2 text-center" title={t('league4.duelsLost')}>DL</th>
                        <th className="p-2 text-center" title={t('league4.duelDiff')}>DD</th>
                        <th className="p-2 text-center" title={t('league4.goalsFor')}>GF</th>
                        <th className="p-2 text-center" title={t('league4.goalsAgainst')}>GA</th>
                        <th className="p-2 text-center" title={t('league4.points')}>PTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((row, index) => (
                        <tr key={row.team_id} className="border-b last:border-0">
                          <td className="p-2 text-center font-bold">{index + 1}</td>
                          <td className="max-w-[200px] truncate p-2 font-semibold">
                            <Link to={`/4vs4/teams/${row.team_id}`} className="underline decoration-brand-500/60 underline-offset-2">
                              {row.team_name}
                            </Link>
                          </td>
                          <td className="p-2 text-center tabular-nums">{row.played}</td>
                          <td className="p-2 text-center tabular-nums">{row.wins}</td>
                          <td className="p-2 text-center tabular-nums">{row.draws}</td>
                          <td className="p-2 text-center tabular-nums">{row.losses}</td>
                          <td className="p-2 text-center tabular-nums">{row.duels_won}</td>
                          <td className="p-2 text-center tabular-nums">{row.duels_lost}</td>
                          <td className="p-2 text-center tabular-nums">{formatDiff(row.duel_diff)}</td>
                          <td className="p-2 text-center tabular-nums">{row.goals_for}</td>
                          <td className="p-2 text-center tabular-nums">{row.goals_against}</td>
                          <td className="p-2 text-center font-black tabular-nums">{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </FadeIn>
      )}
      <BottomNav />
    </main>
  );
}
