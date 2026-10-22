import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useMemo, useState } from 'react';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, LoadingRegion } from '../components/ui/Motion';
import QueryError from '../components/ui/QueryError';
import StatusBadge from '../components/ui/StatusBadge';
import LeagueTeamCard from '../components/league4v4/LeagueTeamCard';
import LeagueSeasonSelect from '../components/league4v4/LeagueSeasonSelect';
import { useLocale } from '../i18n/LocaleContext';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../services/leagueSeasonService';
import { findMyLeagueTeam, listLeagueTeams } from '../services/leagueTeamService';
import { useAuthStore } from '../stores/authStore';

export default function LeagueTeamsPage() {
  const { t } = useLocale();
  const me = useAuthStore((state) => state.profile);
  const [search, setSearch] = useState('');
  const [params, setParams] = useSearchParams();
  const seasonsQuery = useQuery({ queryKey: leagueKeys.seasons, queryFn: listLeagueSeasons });
  const seasons = seasonsQuery.data ?? [];
  const current = pickCurrentLeagueSeason(seasons);
  const season = seasons.find((item) => item.id === params.get('season')) ?? current;
  const teamsQuery = useQuery({
    queryKey: leagueKeys.teams(season?.id ?? 'none'),
    queryFn: () => listLeagueTeams(season!.id),
    enabled: !!season,
  });
  const myTeamQuery = useQuery({
    queryKey: leagueKeys.myTeam(season?.id ?? 'none', me?.id ?? 'none'),
    queryFn: () => findMyLeagueTeam(season!.id, me!.id),
    enabled: !!season && !!me,
  });
  const teams = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (teamsQuery.data ?? []).filter((team) => {
      if (team.status !== 'APPROVED') return false;
      if (!query) return true;
      const captain = team.captain_profile?.display_name ?? team.captain_profile?.username ?? '';
      return team.name.toLowerCase().includes(query) || captain.toLowerCase().includes(query);
    });
  }, [teamsQuery.data, search]);
  const approvedCount = (teamsQuery.data ?? []).filter((team) => team.status === 'APPROVED').length;

  if (!seasonsQuery.isLoading && !season) {
    return <main className="page"><AppBar title={t('league4.teams')} /><EmptyState icon={<Icon name="trophy" />} title={t('league4.noSeason')} hint={t('league4.noSeasonHint')} /><BottomNav /></main>;
  }
  if (seasonsQuery.isError) {
    return <main className="page"><AppBar title={t('league4.teams')} /><QueryError error={seasonsQuery.error} onRetry={() => void seasonsQuery.refetch()} /><BottomNav /></main>;
  }

  return (
    <main className="page">
      <AppBar title={t('league4.teams')} />
      {season && (
        <div className="mt-2 flex items-center gap-2">
          <Link to="/4vs4" className="btn-ghost h-10 px-3 text-sm"><Icon name="back" className="h-4 w-4" /></Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{season.name}</p>
            <p className="text-xs opacity-60">{t('league4.teamsCount', { n: approvedCount })}</p>
          </div>
          <StatusBadge value={season.status} />
        </div>
      )}
      {seasons.length > 1 && (
        <LeagueSeasonSelect
          seasons={seasons}
          value={season?.id ?? ''}
          onChange={(id) => setParams(id === current?.id ? {} : { season: id })}
        />
      )}
      {season && season.id !== current?.id && <p className="mt-2 rounded-xl border border-accent-500/40 bg-accent-500/5 p-2 text-xs opacity-80">{t('league4.pastSeasonNotice')}</p>}
      <div className="relative mt-3">
        <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="input h-11 ps-9 text-sm"
          placeholder={t('league4.searchTeams')}
          aria-label={t('league4.searchTeams')}
        />
      </div>
      {season?.status === 'REGISTRATION' && !myTeamQuery.data && (
        <Link to="/4vs4/teams/create" className="btn-primary mt-2 h-11 w-full text-sm">{t('league4.createSquad')}</Link>
      )}
      {teamsQuery.isLoading ? (
        <LoadingRegion loading label={t('common.loading')} skeleton="list"><span /></LoadingRegion>
      ) : teamsQuery.isError ? (
        <QueryError error={teamsQuery.error} onRetry={() => void teamsQuery.refetch()} />
      ) : teams.length === 0 ? (
        <EmptyState icon={<Icon name="shield" />} title={t('league4.noTeams')} hint={t('league4.noTeamsHint')} />
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {teams.map((team) => <LeagueTeamCard key={team.id} team={team} />)}
        </div>
      )}
      <BottomNav />
    </main>
  );
}
