import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import AppBar from '../components/ui/AppBar';
import BottomNav from '../components/ui/BottomNav';
import Icon from '../components/ui/Icon';
import { EmptyState, LoadingRegion } from '../components/ui/Motion';
import { useLocale } from '../i18n/LocaleContext';
import { leagueKeys } from '../services/leagueKeys';
import { listLeagueSeasons, pickCurrentLeagueSeason } from '../services/leagueSeasonService';
import { createLeagueTeam, findMyLeagueTeam } from '../services/leagueTeamService';
import { useAuthStore } from '../stores/authStore';

export default function LeagueCreateTeamPage() {
  const { t } = useLocale();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuthStore((state) => state.profile);
  const [name, setName] = useState('');
  const seasonsQuery = useQuery({ queryKey: leagueKeys.seasons, queryFn: listLeagueSeasons });
  const season = pickCurrentLeagueSeason(seasonsQuery.data ?? []);
  const myTeamQuery = useQuery({
    queryKey: leagueKeys.myTeam(season?.id ?? 'none', me?.id ?? 'none'),
    queryFn: () => findMyLeagueTeam(season!.id, me!.id),
    enabled: !!season && !!me,
  });
  const mutation = useMutation({
    mutationFn: () => createLeagueTeam(season!.id, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['league'] });
      nav('/4vs4/my-team');
    },
  });

  if (seasonsQuery.isLoading || myTeamQuery.isLoading) {
    return <main className="page"><AppBar title={t('league4.createSquad')} /><LoadingRegion loading label={t('common.loading')} skeleton="card"><span /></LoadingRegion><BottomNav /></main>;
  }
  if (!season) {
    return <main className="page"><AppBar title={t('league4.createSquad')} /><EmptyState icon={<Icon name="trophy" />} title={t('league4.noSeason')} hint={t('league4.noSeasonHint')} /><BottomNav /></main>;
  }
  if (season.status !== 'REGISTRATION') {
    return (
      <main className="page">
        <AppBar title={t('league4.createSquad')} />
        <EmptyState icon={<Icon name="clock" />} title={t('league4.registrationClosed')} hint={t('league4.registrationClosedHint')} />
        <Link to="/4vs4" className="btn-ghost mt-3 h-11 w-full">{t('league4.backHub')}</Link>
        <BottomNav />
      </main>
    );
  }
  if (myTeamQuery.data) {
    return (
      <main className="page">
        <AppBar title={t('league4.createSquad')} />
        <EmptyState icon={<Icon name="shield" />} title={t('league4.alreadyInSquad')} hint={t('league4.alreadyInSquadHint')} />
        <Link to="/4vs4/my-team" className="btn-primary mt-3 h-11 w-full">{t('league4.manageSquad')}</Link>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="page">
      <AppBar title={t('league4.createSquad')} />
      <div className="mt-2 flex items-center gap-2">
        <Link to="/4vs4" className="btn-ghost h-10 px-3"><Icon name="back" className="h-4 w-4" /></Link>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{season.name}</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length >= 2) mutation.mutate();
        }}
        className="card mt-3 flex flex-col gap-3"
      >
        <div>
          <h1 className="font-display text-xl tracking-wide">{t('league4.createSquad')}</h1>
          <p className="mt-1 text-xs opacity-60">{t('league4.createSquadHint')}</p>
        </div>
        <label className="label">
          {t('league4.squadName')}
          <input
            required
            minLength={2}
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="input text-sm"
            placeholder={t('league4.squadNamePlaceholder')}
            autoFocus
          />
        </label>
        <div className="rounded-xl border border-[var(--border)] p-3 text-xs opacity-70">
          <p className="flex items-center gap-1 font-semibold opacity-100"><Icon name="users" className="h-3.5 w-3.5" /> {t('league4.squadSize')}</p>
          <p className="mt-1">{season.roster_min}–{season.roster_max} {t('league4.players')}</p>
          <p className="mt-1">{t('league4.captainAfterCreate')}</p>
        </div>
        {mutation.isError && <p role="alert" className="text-sm text-red-400">{mutation.error.message}</p>}
        <button type="submit" disabled={mutation.isPending || name.trim().length < 2} className="btn-primary h-11">
          {mutation.isPending ? t('league4.creating') : t('league4.createSquad')}
        </button>
      </form>
      <BottomNav />
    </main>
  );
}
